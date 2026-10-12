#!/usr/bin/env bash
# W1.9.G: ephemeral GitHub-hosted Linux namespace routing test.
set -Eeuo pipefail
block() { echo "LAB_BLOCKED: $*" >&2; exit 78; }
[[ "$PEF_NETNS_ACK" == "GITHUB_HOSTED_EPHEMERAL_ONLY" ]] || block "lab acknowledgement required"
[[ "$CI" == "true" && "$GITHUB_ACTIONS" == "true" && "$RUNNER_ENVIRONMENT" == "github-hosted" ]] || block "ephemeral GitHub-hosted runner required"
[[ "$(uname -s)" == "Linux" && "$(id -u)" == "0" ]] || block "root on isolated runner required"
for tool in ip python3 ping mktemp; do command -v "$tool" >/dev/null || block "missing tool $tool"; done
[[ -f "$PEF_NETNS_REPO_ROOT/scripts/lab/netns-client.py" ]] || block "missing trusted repo client"

token="$(printf '%05d' "$(( RANDOM % 100000 ))")-$$"
edge="pef-$token-edge"; lan="pef-$token-lan"; wa="pef-$token-wan-a"; wb="pef-$token-wan-b"
created=()
server_pids=()
tmpdir="$(mktemp -d -t pef-netns-XXXXXXXX)"
cleanup() {
  local failed=0 ns pid
  for pid in "${server_pids[@]}"; do kill "$pid" 2>/dev/null || :; done
  for pid in "${server_pids[@]}"; do wait "$pid" 2>/dev/null || :; done
  for ns in "${created[@]}"; do ip netns del "$ns" >/dev/null 2>&1 || failed=1; done
  rm -rf -- "$tmpdir" || failed=1
  return "$failed"
}
on_exit() {
  local rc=$?
  trap - EXIT
  local cleaned="CLEAN"
  cleanup || { cleaned="FAILED"; rc=1; }
  local result="LAB_PASS"; [[ "$rc" == 0 ]] || result="LAB_FAIL"
  if [[ -n "$PEF_NETNS_EVIDENCE" ]]; then
    printf '{"kind":"PEF_LINUX_NETNS_LAB","status":"%s","scope":"linux-veth-routing-sandbox","cleanup":"%s","checks":["PRIMARY_HTTP","UPSTREAM_BLACKHOLE_CARRIER_UP","FAILOVER_NEW_FLOW","ALL_WAN_DOWN_LAN_UP","FAILBACK_HTTP"],"physical_wan_validated":false,"hardware_validated":false,"p1_durability_validated":false}\n' "$result" "$cleaned" > "$PEF_NETNS_EVIDENCE"
    chmod 0644 "$PEF_NETNS_EVIDENCE"
  fi
  echo "PEF_NETNS_RESULT=$result CLEANUP=$cleaned"
  exit "$rc"
}
trap on_exit EXIT

for ns in "$edge" "$lan" "$wa" "$wb"; do
  ip netns add "$ns"
  created+=("$ns")
  ip -n "$ns" link set lo up
done

# All veth endpoints originate inside Edge netns, never host netns.
ip -n "$edge" link add lan0 type veth peer name peerl
ip -n "$edge" link set peerl netns "$lan"
ip -n "$lan" link set peerl name eth0
ip -n "$edge" link add wa0 type veth peer name peera
ip -n "$edge" link set peera netns "$wa"
ip -n "$wa" link set peera name eth0
ip -n "$edge" link add wb0 type veth peer name peerb
ip -n "$edge" link set peerb netns "$wb"
ip -n "$wb" link set peerb name eth0

ip -n "$edge" addr add 10.250.10.1/24 dev lan0
ip -n "$lan" addr add 10.250.10.2/24 dev eth0
ip -n "$edge" addr add 10.250.20.2/24 dev wa0
ip -n "$wa" addr add 10.250.20.1/24 dev eth0
ip -n "$edge" addr add 10.250.30.2/24 dev wb0
ip -n "$wb" addr add 10.250.30.1/24 dev eth0
for dev in lan0 wa0 wb0; do ip -n "$edge" link set "$dev" up; done
for ns in "$lan" "$wa" "$wb"; do ip -n "$ns" link set eth0 up; done
ip -n "$lan" route replace default via 10.250.10.1 dev eth0
ip -n "$wa" route replace 10.250.10.0/24 via 10.250.20.2 dev eth0
ip -n "$wb" route replace 10.250.10.0/24 via 10.250.30.2 dev eth0
ip -n "$edge" route replace default via 10.250.20.1 dev wa0
ip netns exec "$edge" sysctl -q -w net.ipv4.ip_forward=1

# Both upstream namespaces expose the same test-service IP on their private loopbacks.
ip -n "$wa" addr add 203.0.113.42/32 dev lo
ip -n "$wb" addr add 203.0.113.42/32 dev lo
mkdir -p "$tmpdir/wa" "$tmpdir/wb"
printf 'WAN_A\n' > "$tmpdir/wa/link.txt"
printf 'WAN_B\n' > "$tmpdir/wb/link.txt"
ip netns exec "$wa" python3 -u -m http.server 8765 --bind 203.0.113.42 --directory "$tmpdir/wa" >"$tmpdir/wa.log" 2>&1 &
server_pids+=("$!")
ip netns exec "$wb" python3 -u -m http.server 8765 --bind 203.0.113.42 --directory "$tmpdir/wb" >"$tmpdir/wb.log" 2>&1 &
server_pids+=("$!")

client() { ip netns exec "$lan" python3 "$PEF_NETNS_REPO_ROOT/scripts/lab/netns-client.py" "$1"; }
for ns in "$wa" "$wb"; do
  ready=0
  for attempt in {1..30}; do
    expected="WAN_A"; [[ "$ns" == "$wb" ]] && expected="WAN_B"
    if ip netns exec "$ns" python3 "$PEF_NETNS_REPO_ROOT/scripts/lab/netns-client.py" "$expected" >/dev/null 2>&1; then ready=1; break; fi
    sleep 0.1
  done
  [[ "$ready" == 1 ]] || { echo "endpoint unavailable: $ns" >&2; exit 1; }
done

client WAN_A
# Upstream blackhole while WAN-A carrier remains UP.
ip -n "$wa" addr del 203.0.113.42/32 dev lo
ip -n "$wa" route replace blackhole 203.0.113.42/32
ip -n "$edge" -o link show dev wa0 | grep -q 'UP'
client DOWN
# Simulate policy-selected failover by changing only the Edge namespace route.
ip -n "$edge" route replace default via 10.250.30.1 dev wb0
client WAN_B
# Now both upstreams unavailable, local LAN still reachable.
ip -n "$edge" link set wb0 down
client DOWN
ip netns exec "$lan" ping -q -c 1 -W 1 10.250.10.1 >/dev/null
# Restore A and fail back; no real failover latency or PEF auto-detection claimed.
ip -n "$wa" route del blackhole 203.0.113.42/32
ip -n "$wa" addr add 203.0.113.42/32 dev lo
ip -n "$edge" route replace default via 10.250.20.1 dev wa0
client WAN_A

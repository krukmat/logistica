#!/usr/bin/env bash
set -euo pipefail
[[ "$PEF_ARM64_VM_ACK" == "R28S_GUEST_NETNS_ONLY" && "$(uname -m)" == "aarch64" && "$(id -u)" == "0" ]] || exit 78
command -v systemd-detect-virt >/dev/null && systemd-detect-virt --vm >/dev/null || exit 78
[[ -f "$PEF_ARM64_VM_ROOT/package.json" ]] || exit 78
for cmd in ip ping node;do command -v "$cmd" >/dev/null || exit 78;done
id="pef-$RANDOM-$$";edge="$id-edge";a="$id-a";b="$id-b";lan="$id-lan"
cleanup(){ for ns in "$edge" "$a" "$b" "$lan";do ip netns del "$ns" >/dev/null 2>&1 || :;done; }
trap cleanup EXIT
for ns in "$edge" "$a" "$b" "$lan";do ip netns add "$ns"; ip -n "$ns" link set lo up;done
for spec in "wa0:$a:20" "wb0:$b:30" "lan0:$lan:10";do
 IFS=: read -r nic peer octet <<< "$spec"
 ip -n "$edge" link add "$nic" type veth peer name peer0
 ip -n "$edge" link set peer0 netns "$peer"
 ip -n "$peer" link set peer0 name eth0
 ip -n "$edge" addr add "10.253.$octet.2/24" dev "$nic"
 ip -n "$peer" addr add "10.253.$octet.1/24" dev eth0
 ip -n "$edge" link set "$nic" up
 ip -n "$peer" link set eth0 up
done
cd "$PEF_ARM64_VM_ROOT"
PEF_VM_EDGE="$edge" PEF_VM_WANA="$a" PEF_VM_WANB="$b" node scripts/arm64-vm/guest-network-core.js

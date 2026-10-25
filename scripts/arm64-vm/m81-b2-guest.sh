#!/usr/bin/env bash
# M8.1.B2 — opt-in, existing ARM64 Lima guest ONLY. Never run on the Mac host.
# No cloud host provisioning, route edits, reboot, persistent units, or unisolated fallback.
set -Eeuo pipefail
blocked(){ printf 'M81_B2_BLOCKED:%s\n' "$*" >&2; exit 78; }
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
[[ $# -eq 1 && "${1:-}" == --plan || $# -eq 1 && "${1:-}" == --run ]] ||
 blocked "Usage: m81-b2-guest.sh --plan|--run"
if [[ "$1" == --plan ]];then
 exec node "$repo/bin/pef-m81-b2.js" --plan
fi
[[ "${PEF_M81_B2_ACK:-}" == EXPLICIT_VM_ROOT_SANDBOX_M81B2 ]] ||
 blocked "B2 operator opt-in absent"
[[ "$(uname -s)" == Linux && "$(uname -m)" == aarch64 && "$(id -u)" == 0 ]] ||
 blocked "Linux ARM64 root guest required"
[[ -f "$repo/src/runtime/m81-b2-guest-stack.js" && -f "$repo/package.json" ]] ||
 blocked "mounted source not present"
for bin in node ip chroot cp ldd awk readlink stat mktemp;do
 command -v "$bin" >/dev/null || blocked "missing $bin"
done
# Actual guest/VM/root/systemd/cgroup check, NOT an imported JSON report.
node "$repo/bin/pef-m81-isolation.js" --guest-check >/dev/null ||
 blocked "M81 guest policy rejected actual OS"
[[ "$(stat -f -c %T /sys/fs/cgroup)" == cgroup2fs ]] ||
 blocked "cgroup v2 required"
for controller in cpu memory pids;do
 grep -qw "$controller" /sys/fs/cgroup/cgroup.subtree_control ||
  blocked "no delegated cgroup controller $controller (will not change host delegation)"
done
nodebin="$(readlink -f "$(command -v node)")"
[[ "$nodebin" == /usr/bin/node || "$nodebin" == /usr/local/bin/node ]] ||
 blocked "B1 requires pinned guest node path; refuse alternate binaries"
# Scope and children are exclusively owned by this invocation, never pre-existing.
scope="$(mktemp -d /tmp/pef-m81-b2-XXXXXXXX)" || blocked "no private scope"
chmod 700 "$scope"
names=();dirs=();cgroups=();nspaces=()
cleanup(){
 local rc=$? cleaned=true
 trap - EXIT
 set +e
 for ((i=${#cgroups[@]}-1;i>=0;i--));do
   cg="${cgroups[i]}"
   if [[ -f "$cg/cgroup.kill" ]];then echo 1 > "$cg/cgroup.kill" 2>/dev/null;fi
   removed=false
   for attempt in {1..20};do
     rmdir -- "$cg" 2>/dev/null && { removed=true; break; }
     sleep 0.05
   done
   [[ "$removed" == true ]] || cleaned=false
 done
 for ((i=${#nspaces[@]}-1;i>=0;i--));do
   ip netns del "${nspaces[i]}" 2>/dev/null || cleaned=false
 done
 for ((i=${#dirs[@]}-1;i>=0;i--));do
   [[ "${dirs[i]}" == /tmp/pef-m81-[0-9]* ]] || { cleaned=false; continue; }
   rm -rf -- "${dirs[i]}" || cleaned=false
 done
 if [[ -s "$scope/guest-result.json" ]];then
  node - "$scope/guest-result.json" "$cleaned" "$rc" <<'NODE'
const fs=require("node:fs");
const data=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const cleanupOk=process.argv[3]==="true",processOk=process.argv[4]==="0";
data.cleanup={status:cleanupOk?"PASS":"FAIL",ownedResourcesRemoved:cleanupOk};
data.ok=data.ok===true&&cleanupOk&&processOk;
data.status=data.ok?"LAB_PASS":"LAB_FAIL";
console.log(JSON.stringify(data,null,2));
NODE
 else
  printf 'M81_B2_GUEST_INCOMPLETE exit=%s cleanup=%s\n' "$rc" "$cleaned" >&2
 fi
 rm -rf -- "$scope" || cleaned=false
 [[ "$cleaned" == true && "$rc" -eq 0 ]] || exit 1
 exit 0
}
trap cleanup EXIT
stage(){
 local profile="$1" name="pef-m81-$$-$RANDOM" base cg root cpu memory swap pids
 # The names are not attacker-supplied and must not collide with existing lab resources.
 [[ "$name" =~ ^pef-m81-[0-9]+-[0-9]+$ ]] || blocked "name invalid"
 base="/tmp/$name";cg="/sys/fs/cgroup/$name";root="$base/root"
 [[ ! -e "$base" && ! -e "$cg" && ! -e "/var/run/netns/$name" ]] ||
 blocked "scope collision; never reuse sandbox"
 mkdir -m 0700 -- "$base";dirs+=("$base")
 mkdir -m 0755 -- "$root"
 printf 'B2_GUEST_CANARY\n' >"$base/host-canary"
 chmod 600 "$base/host-canary"
 mkdir -- "$cg";cgroups+=("$cg")
 mapfile -t limits < <(node - "$repo" "$profile" <<'NODE'
const [root,profile]=process.argv.slice(2);
const {propertyManifest,hostManifest}=require(root+"/src/runtime/demo-workload.js");
const {makeLinuxIsolationPlan}=require(root+"/src/adapters/linux-workload-isolation.js");
const plan=makeLinuxIsolationPlan(profile==="property"?propertyManifest():hostManifest());
console.log(plan.cpuMax);console.log(plan.memoryMax);
console.log(plan.memorySwapMax);console.log(plan.pidsMax);
NODE
 )
 [[ "${#limits[@]}" == 4 ]] || blocked "Core manifest plan missing"
 cpu="${limits[0]}";memory="${limits[1]}";swap="${limits[2]}";pids="${limits[3]}"
 [[ "$cpu" =~ ^[0-9]+\ [0-9]+$ && "$memory" =~ ^[0-9]+$ &&
    "$swap" == 0 && "$pids" == 16 ]] || blocked "invalid Core kernel quotas"
 printf '%s\n' "$cpu" >"$cg/cpu.max"
 printf '%s\n' "$memory" >"$cg/memory.max"
 printf '%s\n' "$swap" >"$cg/memory.swap.max"
 printf '%s\n' "$pids" >"$cg/pids.max"
 [[ "$(cat "$cg/cpu.max")" == "$cpu" &&
    "$(cat "$cg/memory.max")" == "$memory" &&
    "$(cat "$cg/memory.swap.max")" == "$swap" &&
    "$(cat "$cg/pids.max")" == "$pids" ]] || blocked "kernel quota readback failed"
 ip netns add "$name";nspaces+=("$name")
 ip -n "$name" link set lo up
 mkdir -p "$root/app/workloads" "$root/app/core"
 cp -L --parents "$nodebin" "$root/"
 local lib
 while IFS= read -r lib;do
   [[ -f "$lib" ]] || blocked "Node shared library missing: $lib"
   cp -L --parents "$lib" "$root/"
 done < <(ldd "$nodebin" | awk '{for(i=1;i<=NF;i++)if($i ~ /^\//){print $i;break}}')
 cp "$repo/src/workloads/site-operations-worker.js" "$root/app/workloads/"
 cp "$repo/src/core/site-operation-contract.js" "$root/app/core/"
 [[ -f "$root$nodebin" && -f "$root/app/workloads/site-operations-worker.js" ]] ||
 blocked "worker rootfs incomplete"
 names+=("$name")
}
stage property
stage host
# Runs both workload types + localhost TLS Cloud Lite in this guest. Node process
# is the supervisor; the kernel workers have distinct cgroups and netns.
node "$repo/bin/pef-m81-b2.js" --run "$scope" "${names[0]}" "${names[1]}"  > "$scope/guest-result.json"

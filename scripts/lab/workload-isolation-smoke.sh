#!/usr/bin/env bash
# S3 CI-only: cgroup v2 + network namespace + chroot under an ephemeral GitHub-hosted VM.
# Never invoke against a local Mac or production device.
set -Eeuo pipefail
blocked(){ printf 'PEF_S3=BLOCKED reason=%s\n' "$*" >&2; exit 78; }
[[ "${PEF_S3_ACK:-}" == "GITHUB_HOSTED_EPHEMERAL_ONLY" &&
    "${GITHUB_ACTIONS:-}" == "true" && "${RUNNER_ENVIRONMENT:-}" == "github-hosted" &&
    "${CI:-}" == "true" && "$(id -u)" == 0 && "$(uname -s)" == "Linux" ]] ||
  blocked "hosted ephemeral root-only"
for tool in ip unshare chroot ldd cp timeout readlink; do
  command -v "$tool" >/dev/null || blocked "missing $tool"
done
[[ "$(stat -f -c %T /sys/fs/cgroup)" == "cgroup2fs" ]] || blocked "cgroup v2 required"
for controller in cpu memory pids; do
  grep -qw "$controller" /sys/fs/cgroup/cgroup.subtree_control ||
    blocked "parent controller $controller unavailable"
done
[[ -f "${PEF_S3_REPO_ROOT:-}/src/core/local-receipts.js" &&
   -x "${PEF_S3_NODE:-}" ]] || blocked "trusted repo/Node required"
token="$RANDOM-$$"
name="pef-s3-$token"
cg="/sys/fs/cgroup/$name"
tmpdir="$(mktemp -d -t pef-s3-XXXXXXXX)"
root="$tmpdir/root"
out="$tmpdir/child.out"
pid=""
created_ns=0
created_cg=0
cleanup(){
  local failed=0
  if [[ $created_cg -eq 1 ]]; then
    if [[ -f "$cg/cgroup.kill" ]]; then echo 1 >"$cg/cgroup.kill" 2>/dev/null || :; fi
    for attempt in {1..20}; do rmdir "$cg" 2>/dev/null && { created_cg=0; break; }; sleep .05; done
    [[ $created_cg -eq 0 ]] || failed=1
  fi
  if [[ $created_ns -eq 1 ]]; then ip netns del "$name" 2>/dev/null || failed=1; fi
  rm -rf -- "$tmpdir" || failed=1
  return "$failed"
}
on_exit(){
  local rc=$? state="FAILED"
  trap - EXIT
  [[ $rc -eq 0 ]] && state="PASS"
  local cleaned="CLEAN"
  cleanup || { state="FAILED"; cleaned="FAILED"; rc=1; }
  if [[ -n "${PEF_S3_EVIDENCE:-}" ]]; then
    printf '{"kind":"PEF_S3_LINUX_ISOLATION_LAB","status":"LAB_%s","cleanup":"%s","cpu_max":"%s","memory_max_bytes":%s,"pids_max":%s,"network_namespace":true,"chroot_dropped_uid":65534,"physicalValidated":false}\n' "$state" "$cleaned" "${limits[0]}" "${limits[1]}" "${limits[2]}" >"$PEF_S3_EVIDENCE"
  fi
  echo "PEF_S3_ISOLATION=LAB_$state CLEANUP=$cleaned"
  exit "$rc"
}
trap on_exit EXIT
mkdir "$cg"
created_cg=1
mapfile -t limits < <("$PEF_S3_NODE" "$PEF_S3_REPO_ROOT/scripts/lab/workload-sandbox-plan.js" --fields)
[[ "${#limits[@]}" -eq 3 && "${limits[0]}" =~ ^[0-9]+\ [0-9]+$ &&
   "${limits[1]}" =~ ^[0-9]+$ && "${limits[2]}" =~ ^[0-9]+$ ]] ||
  blocked "invalid Core workload resource plan"
printf '%s\n' "${limits[0]}" >"$cg/cpu.max"
printf '%s\n' "${limits[1]}" >"$cg/memory.max"
[[ -f "$cg/memory.swap.max" ]] || blocked "swap controller unavailable"
printf '0\n' >"$cg/memory.swap.max"
printf '%s\n' "${limits[2]}" >"$cg/pids.max"
[[ "$(cat "$cg/cpu.max")" == "${limits[0]}" &&
   "$(cat "$cg/memory.max")" == "${limits[1]}" &&
   "$(cat "$cg/memory.swap.max")" == "0" &&
   "$(cat "$cg/pids.max")" == "${limits[2]}" ]] || blocked "kernel limits not applied"
ip netns add "$name"
created_ns=1
ip -n "$name" link set lo up
mkdir -p "$root/app/src/core" "$root/app/src/runtime" "$root/app/src/adapters" "$root/data" "$root/proc" "$root/tmp"
chmod 755 "$root"
chown 65534:65534 "$root/data"
chmod 700 "$root/data"
node_bin="$(readlink -f "$PEF_S3_NODE")"
cp -L --parents "$node_bin" "$root"
while IFS= read -r lib; do
  [[ -f "$lib" ]] || blocked "missing binary dependency $lib"
  cp -L --parents "$lib" "$root"
done < <(ldd "$node_bin" | awk '{for(i=1;i<=NF;i++)if($i ~ /^\//){print $i;break}}')
cp "$PEF_S3_REPO_ROOT/src/core/workload-manager.js" "$root/app/src/core/"
cp "$PEF_S3_REPO_ROOT/src/core/local-receipts.js" "$root/app/src/core/"
cp "$PEF_S3_REPO_ROOT/src/core/event-envelope.js" "$root/app/src/core/"
# Event-envelope now imports a pure, allowlisted site-operations contract; copy code only.
cp "$PEF_S3_REPO_ROOT/src/core/site-operation-contract.js" "$root/app/src/core/"
cp "$PEF_S3_REPO_ROOT/src/adapters/os-file-journal.js" "$root/app/src/adapters/"
cp "$PEF_S3_REPO_ROOT/src/runtime/demo-workload.js" "$root/app/src/runtime/"
cp "$PEF_S3_REPO_ROOT/scripts/lab/isolated-receiver.js" "$root/app/"
printf 'HOST_CANARY\n' > "$tmpdir/host-canary"
export PEF_HOST_SENTINEL="$tmpdir/host-canary"
# Suspend launcher first: its children inherit the dedicated cgroup before executing.
bash -c 'kill -STOP "$$"; exec "$@"' _ timeout -k 2s 20s \
  ip netns exec "$name" unshare --mount --pid --fork --mount-proc="$root/proc" \
  chroot --userspec=65534:65534 "$root" "$node_bin" /app/isolated-receiver.js >"$out" 2>&1 &
pid=$!
sleep 0.1
printf '%s\n' "$pid" >"$cg/cgroup.procs"
kill -CONT "$pid"
if ! wait "$pid"; then cat "$out" >&2; exit 1; fi
cat "$out"
grep -q 'PEF_S3_CHILD_PASS=' "$out" || { echo "missing child evidence" >&2; exit 1; }
peak="$(cat "$cg/memory.peak")"
[[ "$peak" -gt 0 && "$peak" -le "${limits[1]}" ]] || { echo "PEF_S3_MEMORY_INVALID=$peak" >&2; exit 1; }
echo "PEF_S3_KERNEL_LIMITS=PASS cpu.max=${limits[0]} memory.max=${limits[1]} swap.max=0 pids.max=${limits[2]} memory.peak=$peak"

# S3.4–S3.6: supervisor host is OUTSIDE the kernel cgroup; forked worker is INSIDE.
# Same manifest/driver Core as the Mac emulator, with CI-only Linux adapter.
cp "$PEF_S3_REPO_ROOT/src/workloads/receiver-worker.js" "$root/app/receiver-worker.js"
mkdir -p "$tmpdir/host-journal"
printf 'PEF_S34_HOST_SENTINEL\n' > "$tmpdir/host-canary"
timeout -k 3s 45s "$PEF_S3_NODE" "$PEF_S3_REPO_ROOT/scripts/lab/supervised-linux-worker.js" \
  "$name" "$cg" "$root" "$node_bin" "$tmpdir/host-journal" "$tmpdir/host-canary" \
  >"$tmpdir/supervised.out" 2>&1 || {
    cat "$tmpdir/supervised.out" >&2
    exit 1
  }
cat "$tmpdir/supervised.out"
grep -q '^PEF_S34_SUPERVISED_LINUX_PASS=' "$tmpdir/supervised.out" || {
  echo "supervised Linux lifecycle evidence absent" >&2
  exit 1
}
if [[ -n "${PEF_S34_EVIDENCE:-}" ]]; then
  sed -n 's/^PEF_S34_SUPERVISED_LINUX_PASS=//p' "$tmpdir/supervised.out" > "$PEF_S34_EVIDENCE"
  [[ -s "$PEF_S34_EVIDENCE" ]] || { echo "missing S3.4 artifact" >&2; exit 1; }
fi

# M5.5: reuse EXACT Core supervisor and isolated process driver for Property and Host.
# All privileged commands remain guarded by this script's initial hosted CI preflight.
mkdir -p "$root/app/workloads" "$root/app/core"
cp "$PEF_S3_REPO_ROOT/src/workloads/site-operations-worker.js" "$root/app/workloads/"
cp "$PEF_S3_REPO_ROOT/src/core/site-operation-contract.js" "$root/app/core/"
for siteprofile in property host; do
  mapfile -t site_limits < <("$PEF_S3_NODE" - "$PEF_S3_REPO_ROOT" "$siteprofile" <<'NODE'
const root=process.argv[2],profile=process.argv[3];
const {propertyManifest,hostManifest}=require(root+"/src/runtime/demo-workload.js");
const {makeLinuxIsolationPlan}=require(root+"/src/adapters/linux-workload-isolation.js");
const plan=makeLinuxIsolationPlan(profile==="property"?propertyManifest():hostManifest());
console.log(plan.cpuMax);console.log(plan.memoryMax);console.log(plan.pidsMax);
NODE
)
  [[ "${#site_limits[@]}" == 3 ]] || { echo "M55_INVALID_LIMIT_PLAN" >&2;exit 1; }
  printf '%s\n' "${site_limits[0]}" > "$cg/cpu.max"
  printf '%s\n' "${site_limits[1]}" > "$cg/memory.max"
  printf '%s\n' "${site_limits[2]}" > "$cg/pids.max"
  [[ "$(cat "$cg/cpu.max")" == "${site_limits[0]}" &&
     "$(cat "$cg/memory.max")" == "${site_limits[1]}" &&
     "$(cat "$cg/pids.max")" == "${site_limits[2]}" ]] ||
    { echo "M55_LIMIT_NOT_ENFORCED" >&2;exit 1; }
  mkdir -p "$tmpdir/$siteprofile-journal"
  timeout -k 3s 35s "$PEF_S3_NODE" "$PEF_S3_REPO_ROOT/scripts/lab/supervised-site-worker.js" \
    "$siteprofile" "$name" "$cg" "$root" "$node_bin" \
    "$tmpdir/$siteprofile-journal" "$tmpdir/host-canary" \
    >"$tmpdir/site-$siteprofile.out" 2>&1 || {
      cat "$tmpdir/site-$siteprofile.out" >&2
      exit 1
    }
  cat "$tmpdir/site-$siteprofile.out"
  sed -n 's/^PEF_M55_PROFILE_PASS=//p' "$tmpdir/site-$siteprofile.out" > "$tmpdir/site-$siteprofile.json"
  [[ -s "$tmpdir/site-$siteprofile.json" ]] || { echo "M55_MISSING_PROFILE_EVIDENCE" >&2;exit 1; }
done
"$PEF_S3_NODE" - "$tmpdir/site-property.json" "$tmpdir/site-host.json" <<'NODE' > "${PEF_M55_EVIDENCE:-$tmpdir/m55.json}"
const fs=require("node:fs");
const results=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));
if(results.length!==2||results.some(x=>!x.ok||x.status!=="LAB_PASS"||
  x.actualLimitsEnforced!==true||x.physicalValidated!==false)||results[0].profile!=="property"||
  results[1].profile!=="host")throw Error("M55_PROFILES_INCOMPLETE");
console.log(JSON.stringify({kind:"PEF_M55_KERNEL_OVERLAYS_V1",status:"LAB_PASS",ok:true,
 profiles:{property:results[0],host:results[1]},scope:"EPHEMERAL_GITHUB_LINUX",
 physicalValidated:false,systemServiceInstalled:false}));
NODE
echo "M55_BOTH_OVERLAYS=LAB_PASS"

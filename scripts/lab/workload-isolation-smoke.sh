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
  cleanup || { state="FAILED"; rc=1; }
  echo "PEF_S3_ISOLATION=$state CLEANUP=$([[ $created_cg -eq 0 ]] && echo CLEAN || echo FAILED)"
  exit "$rc"
}
trap on_exit EXIT
mkdir "$cg"
created_cg=1
printf '20000 100000\n' > "$cg/cpu.max"
printf '134217728\n' > "$cg/memory.max"
printf '16\n' > "$cg/pids.max"
[[ "$(cat "$cg/cpu.max")" == "20000 100000" &&
   "$(cat "$cg/memory.max")" == "134217728" &&
   "$(cat "$cg/pids.max")" == "16" ]] || blocked "kernel limits not applied"
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
[[ "$peak" -gt 0 && "$peak" -le 134217728 ]] || { echo "PEF_S3_MEMORY_INVALID=$peak" >&2; exit 1; }
echo "PEF_S3_KERNEL_LIMITS=PASS cpu.max=20000/100000 memory.max=134217728 pids.max=16 memory.peak=$peak"

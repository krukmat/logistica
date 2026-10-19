#!/usr/bin/env bash
# M5.6 — real package -> systemd -> Edge -> cgroup v2/netns/chroot Property/Host.
# CI-only disposable Linux root fixture; NEVER a field-device/production installer.
set -Eeuo pipefail
blocked(){ echo "M56_LAB_BLOCKED:$*" >&2; exit 78; }
[[ "${PEF_M56_ACK:-}" == GITHUB_HOSTED_EPHEMERAL_SERVICE_ONLY &&
  "${PEF_S3_ACK:-}" == GITHUB_HOSTED_EPHEMERAL_ONLY &&
  "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted &&
  "${CI:-}" == true && "$(id -u)" == 0 && "$(uname -s)" == Linux &&
  "$(cat /proc/1/comm)" == systemd ]] || blocked "CI/root/systemd/sandbox required"
[[ $# == 6 ]] || blocked "expected trusted CI sandbox args"
namespace="$1";cg="$2";rootfs="$3";nodebin="$4";scope="$5";canary="$6"
[[ "$namespace" =~ ^pef-s3-[0-9]+-[0-9]+$ &&
  "$cg" == "/sys/fs/cgroup/$namespace" &&
  "$rootfs" == "$scope/root" &&
  "$scope" == /tmp/pef-s3-* &&
  "$nodebin" == /* && "$canary" == "$scope/host-canary" &&
  -d "$cg" && -d "$rootfs" && -f "$rootfs/app/workloads/site-operations-worker.js" &&
  -x "$nodebin" && -e "/var/run/netns/$namespace" ]] || blocked "sandbox scope mismatch"
for bin in systemctl systemd-analyze curl node; do
 command -v "$bin" >/dev/null || blocked "missing binary $bin"
done
[[ -f "$PEF_S3_REPO_ROOT/src/runtime/m56-kernel-service.js" ]] ||
  blocked "missing packaged host source"
releaseRoot="$scope/m56-release"
node bin/pef-m5-install.js install --root "$releaseRoot" --version v1 >"$scope/m56-install.json"
node bin/pef-m5-install.js verify --root "$releaseRoot" >"$scope/m56-verify.json"
release="$releaseRoot/releases/v1"
[[ -f "$release/bin/pef-m56-edge.js" ]] || blocked "special CI entrypoint not packaged"
unit=""
cleanup(){
 local rc=$?
 trap - EXIT
 if [[ -n "$unit" ]];then
   systemctl stop "$unit.service" >/dev/null 2>&1 || :
   rm -f -- "/run/systemd/system/$unit.service"
   systemctl daemon-reload >/dev/null 2>&1 || :
   echo 1 > "$cg/cgroup.kill" 2>/dev/null || :
 fi
 exit "$rc"
}
trap cleanup EXIT
unit="pef-m56-${RANDOM}-$$"
unitfile="/run/systemd/system/$unit.service"
unitEnv="$scope/m56-token.env"
token="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
printf 'PEF_EDGE_TOKEN=%s\n' "$token" > "$unitEnv"
chmod 600 "$unitEnv"
port="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
[[ "$port" =~ ^[0-9]+$ ]] || blocked "no port"
url="http://127.0.0.1:$port"
cat > "$unitfile" <<EOF
# M5.6 ROOT LAB ONLY. NEVER copy into production service provisioning.
[Unit]
Description=PEF M5.6 disposable CI isolated service $namespace
After=local-fs.target
StartLimitIntervalSec=0
[Service]
Type=exec
User=root
WorkingDirectory=$release
EnvironmentFile=$unitEnv
Environment=CI=true GITHUB_ACTIONS=true RUNNER_ENVIRONMENT=github-hosted PEF_S3_ACK=GITHUB_HOSTED_EPHEMERAL_ONLY PEF_M56_ACK=GITHUB_HOSTED_EPHEMERAL_SERVICE_ONLY
ExecStart=$nodebin $release/bin/pef-m56-edge.js --config $scope/m56-config.json --namespace $namespace --cgroup $cg --rootfs $rootfs --node-inside $nodebin --host-canary $canary
ExecStopPost=/bin/sh -c 'echo 1 > $cg/cgroup.kill'
Restart=on-failure
RestartSec=1
TimeoutStopSec=8
KillMode=control-group
UMask=0077
PrivateTmp=false
ProtectSystem=false
NoNewPrivileges=false
[Install]
WantedBy=multi-user.target
EOF
chmod 644 "$unitfile"
# This service exercises the root-only CI process driver; not a production systemd template.
systemd-analyze verify "$unitfile"
systemctl daemon-reload
checksfile="$scope/m56-evidence.ndjson"
: > "$checksfile"
for profile in property host;do
  case "$profile" in
    property)
      cpu="15000 100000";mem="67108864"
      create='{"operation":"ALERT","incidentId":"M56-1","assetId":"PUMP-01","severity":"WARNING"}'
      opposite="host";;
    host)
      cpu="18000 100000";mem="83886080"
      create='{"operation":"OPEN","incidentId":"M56-1","unitId":"CABIN-07","category":"MAINTENANCE","severity":"WARNING"}'
      opposite="property";;
  esac
  echo "$cpu" > "$cg/cpu.max"
  echo "$mem" > "$cg/memory.max"
  echo 0 > "$cg/memory.swap.max"
  echo 16 > "$cg/pids.max"
  [[ "$(cat "$cg/cpu.max")" == "$cpu" &&
     "$(cat "$cg/memory.max")" == "$mem" &&
     "$(cat "$cg/pids.max")" == 16 ]] || blocked "kernel quota write failed"
  mkdir "$scope/m56-$profile-data"
  cat > "$scope/m56-config.json" <<EOF
{"schemaVersion":1,"backend":"virtual-lab","identity":{"siteId":"m56-ci","deviceId":"m56-$profile","configRevision":"r1"},"storageDir":"$scope/m56-$profile-data","http":{"host":"127.0.0.1","port":$port},"sampleIntervalMs":250,"workload":{"enabled":true,"profile":"$profile","reconcileMs":200},"journal":{"capacityBytes":65536,"controlReserveBytes":4096},"wan":{"primary":{"link":true,"upstream":false},"backup":{"link":true,"upstream":false}}}
EOF
  chmod 600 "$scope/m56-config.json"
  systemctl start "$unit.service"
  ready(){
    [[ "$(systemctl is-active "$unit.service" 2>/dev/null)" == active ]] || return 1
    curl -fsS --max-time 1 -H "x-pef-token: $token" "$url/ready" >/dev/null 2>&1
  }
  for i in {1..100};do ready && break;sleep .1;done
  ready || { systemctl status "$unit.service" --no-pager >&2 || :; exit 1; }
  pidBefore="$(systemctl show -P MainPID "$unit.service")"
  curl -fsS --max-time 3 -H "x-pef-token: $token" "$url/state" > "$scope/m56-before.json"
  curl -fsS --max-time 3 -H "x-pef-token: $token" -H 'content-type: application/json' \
    -d "$create" "$url/$profile/incidents" > "$scope/m56-created.json"
  curl -fsS --max-time 3 -H "x-pef-token: $token" -H 'content-type: application/json' \
    -d '{"operation":"ACK","incidentId":"M56-1"}' "$url/$profile/incidents" > "$scope/m56-ack.json"
  badcode="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 -H "x-pef-token: $token" \
    -H 'content-type: application/json' -d "$create" "$url/$opposite/incidents")"
  [[ "$badcode" == 409 ]] || blocked "cross-profile operation unexpectedly accepted"
  # Genuine systemd supervised main-process SIGKILL, not child-only supervisor crash.
  systemctl kill --kill-whom=main --signal=SIGKILL "$unit.service"
  restarted=0
  for i in {1..140};do
    pidAfter="$(systemctl show -P MainPID "$unit.service" 2>/dev/null || echo 0)"
    if [[ "$pidAfter" =~ ^[0-9]+$ && "$pidAfter" -gt 1 &&
      "$pidAfter" != "$pidBefore" ]] && ready;then restarted=1;break;fi
    sleep .1
  done
  [[ "$restarted" == 1 ]] || { systemctl status "$unit.service" --no-pager >&2 || :;exit 1; }
  curl -fsS --max-time 3 -H "x-pef-token: $token" "$url/state" > "$scope/m56-after.json"
  node - "$profile" "$scope/m56-before.json" "$scope/m56-created.json" \
      "$scope/m56-ack.json" "$scope/m56-after.json" "$cg" "$release" <<'NODE' >> "$checksfile"
const fs=require("node:fs"),path=require("node:path");
const [profile,before,created,ack,after,cg,release]=process.argv.slice(2);
const load=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const old=load(before),a=load(created),b=load(ack),newer=load(after);
const manifest=JSON.parse(fs.readFileSync(path.join(release,"manifest.json")));
const worker=newer.workloads[0];
const quotas={cpu:fs.readFileSync(path.join(cg,"cpu.max"),"utf8").trim(),
  memory:fs.readFileSync(path.join(cg,"memory.max"),"utf8").trim(),
  pids:fs.readFileSync(path.join(cg,"pids.max"),"utf8").trim()};
const expected=profile==="property"?["15000 100000","67108864"]:["18000 100000","83886080"];
const checks={
  PACKAGED_RELEASE:manifest.version==="v1"&&manifest.files.some(x=>x.path==="bin/pef-m56-edge.js"),
  SYSTEMD_REAL_SERVICE:newer.runtimeHealth==="HEALTHY"&&newer.dashboardRequired===false,
  PROFILE_MATCH:worker?.workloadId==="pef-"+profile&&newer.activeOverlay===profile,
  KERNEL_ENFORCED:worker?.actualLimitsEnforced===true&&
    worker.isolation==="LINUX_CGROUP_NETNS_CHROOT_CI",
  MANIFEST_QUOTAS:quotas.cpu===expected[0]&&quotas.memory===expected[1]&&quotas.pids==="16",
  DURABLE_ALERT_AND_ACK:a.http===undefined&&a.fsyncCompleted===true&&b.fsyncCompleted===true,
  NEW_SESSION_AFTER_SYSTEMD_RESTART:old.identity.sessionId!==newer.identity.sessionId,
  JOURNAL_RECOVERED:newer[profile+"Incidents"].some(x=>x.incidentId==="M56-1"&&x.status==="ACKNOWLEDGED"),
  LOCAL_ONLY:noWAN(newer),
  STORAGE_NOT_UNSAFE:newer.storage.unsafe===false
};
function noWAN(x){return x.network.connectivity==="LOCAL_ONLY"&&x.remoteCloudConnected===false;}
const ok=Object.values(checks).every(Boolean);
const result={kind:"PEF_M56_SYSTEMD_KERNEL_PROFILE_V1",profile,ok,status:ok?"LAB_PASS":"LAB_FAIL",
  checks,quotas,origin:"ACTUAL_GITHUB_HOSTED_LINUX_SYSTEMD_CGROUP_V2",
  physicalValidated:false,systemRebootValidated:false,storageQuotaEnforced:false,
  hostedCiOnly:true,cloud:"LOCAL_MOCK",wan:"SYNTHETIC"};
console.log(JSON.stringify(result));
if(!ok)process.exitCode=1;
NODE
  systemctl stop "$unit.service"
  [[ "$(systemctl is-active "$unit.service" 2>/dev/null)" != active ]] ||
    blocked "systemd service refused stop"
done
node - "$checksfile" <<'NODE' > "${PEF_M56_EVIDENCE:-$scope/m56-result.json}"
const fs=require("node:fs");
const results=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(x=>JSON.parse(x));
if(results.length!==2||results.some(x=>!x.ok||x.status!=="LAB_PASS")||
 results[0].profile!=="property"||results[1].profile!=="host")
 throw Error("M56_PROFILES_NOT_BOTH_VALIDATED");
console.log(JSON.stringify({kind:"PEF_M56_INTEGRATED_SYSTEMD_KERNEL_LAB_V1",
 status:"LAB_PASS",ok:true,profiles:{property:results[0],host:results[1]},
 servicedBy:"ACTUAL_GITHUB_HOSTED_LINUX_SYSTEMD_PID1",
 releaseVerified:true,physicalValidated:false,vmRebootValidated:false,
 combinedKernelSystemdValidated:true,cloudMockOnly:true,productionAuthorized:false}));
NODE
echo "M56_COMBINED_SYSTEMD_KERNEL=LAB_PASS"

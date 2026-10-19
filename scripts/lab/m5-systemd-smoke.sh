#!/usr/bin/env bash
# M5.4: real systemd service on ephemeral GitHub-hosted Linux ONLY.
# No physical boot tests, no production service install, no Mac modifications.
set -Eeuo pipefail
blocked(){ echo "M54_SYSTEMD_BLOCKED:$*" >&2; exit 78; }
[[ "${PEF_M54_ACK:-}" == "GITHUB_HOSTED_EPHEMERAL_ONLY" &&
  "${GITHUB_ACTIONS:-}" == "true" && "${RUNNER_ENVIRONMENT:-}" == "github-hosted" &&
  "${CI:-}" == "true" && "$(id -u)" == 0 && "$(uname -s)" == "Linux" ]] ||
  blocked "requires trusted ephemeral Linux runner root and explicit ACK"
for tool in systemctl systemd-analyze curl node runuser; do
  command -v "$tool" >/dev/null || blocked "missing $tool"
done
[[ "$(cat /proc/1/comm)" == systemd ]] || blocked "systemd not PID1"
root="$(mktemp -d -t pef-m54-XXXXXXXX)"
unit="pef-m54-${RANDOM}-$$"
unitfile="/run/systemd/system/$unit.service"
user="${SUDO_USER:-runner}"
[[ "$user" =~ ^[a-z_][a-z0-9_-]*$ && "$user" != root ]] || blocked "invalid unprivileged runner"
group="$(id -gn "$user")"
clean(){
  rc=$?
  trap - EXIT
  systemctl stop "$unit.service" >/dev/null 2>&1 || :
  rm -f -- "$unitfile"
  systemctl daemon-reload >/dev/null 2>&1 || :
  rm -rf -- "$root"
  exit "$rc"
}
trap clean EXIT
mkdir -p "$root/install"
chown "$user:$group" "$root" "$root/install"
chmod 700 "$root"
runuser -u "$user" -- env NODE_ENV=test node bin/pef-m5-install.js install \
  --root "$root/install" --version v1 >"$root/installed.json"
release="$root/install/releases/v1"
mkdir -p "$root/install/data"
chown -R "$user:$group" "$root/install"
nodebin="$(readlink -f "$(command -v node)")"
port="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
token="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
printf '%s\n' "PEF_EDGE_TOKEN=$token" >"$root/edge.env"
chmod 600 "$root/edge.env"
cat >"$root/edge.json" <<EOF
{"schemaVersion":1,"backend":"virtual-lab","identity":{"siteId":"m54-ci","deviceId":"m54-edge","configRevision":"r1"},"storageDir":"$root/install/data","http":{"host":"127.0.0.1","port":$port},"sampleIntervalMs":250,"workload":{"enabled":true,"profile":"property","reconcileMs":200},"journal":{"capacityBytes":65536,"controlReserveBytes":4096},"wan":{"primary":{"link":true,"upstream":false},"backup":{"link":true,"upstream":false}}}
EOF
chown "$user:$group" "$root/edge.json"
chmod 600 "$root/edge.json"
node - "$nodebin" "$release" "$root/edge.json" "$root/edge.env" "$root/install/data" "$user" "$group" <<'NODE' >"$unitfile"
const {renderLabServiceUnit}=require("./src/runtime/m5-systemd-unit.js");
process.stdout.write(renderLabServiceUnit({
 nodePath:process.argv[2],releaseDir:process.argv[3],configFile:process.argv[4],
 envFile:process.argv[5],dataDir:process.argv[6],user:process.argv[7],group:process.argv[8]}));
NODE
systemd-analyze verify "$unitfile"
systemctl daemon-reload
systemctl start "$unit.service"
ready(){
  [[ "$(systemctl is-active "$unit.service" 2>/dev/null)" == active ]] || return 1
  curl --silent --fail --max-time 1 -H "x-pef-token: $token" "http://127.0.0.1:$port/ready" >/dev/null
}
for i in {1..100};do ready && break;sleep .1;done
ready || { systemctl status "$unit.service" --no-pager >&2 || :;exit 1; }
before="$(systemctl show -P MainPID "$unit.service")"
[[ "$before" =~ ^[0-9]+$ && "$before" -gt 1 ]] || exit 1
curl --silent --fail --max-time 3 -H "x-pef-token: $token" -H "content-type: application/json" -d '{"operation":"ALERT","incidentId":"M54-1","assetId":"PUMP-01","severity":"WARNING"}' "http://127.0.0.1:$port/property/incidents" >"$root/open.json"
curl --silent --fail --max-time 3 -H "x-pef-token: $token" -H "content-type: application/json" -d '{"operation":"ACK","incidentId":"M54-1"}' "http://127.0.0.1:$port/property/incidents" >"$root/ack.json"
node - "$root/open.json" "$root/ack.json" <<'NODE'
const fs=require("node:fs");
for(const p of process.argv.slice(2)){const r=JSON.parse(fs.readFileSync(p));if(r.fsyncCompleted!==true||r.accepted!==true)process.exit(1);}
NODE
systemctl kill --kill-whom=main --signal=SIGKILL "$unit.service"
restarted=0
for i in {1..130};do
  now="$(systemctl show -P MainPID "$unit.service" 2>/dev/null || echo 0)"
  if [[ "$now" =~ ^[0-9]+$ && "$now" -gt 1 && "$now" != "$before" ]] && ready;then
    restarted=1;break
  fi
  sleep .1
done
[[ "$restarted" == 1 ]] || { systemctl status "$unit.service" --no-pager >&2 || :;exit 1; }
curl --silent --fail --max-time 2 -H "x-pef-token: $token" "http://127.0.0.1:$port/state" >"$root/after.json"
node - "$root/after.json" <<'NODE'
const fs=require("node:fs"),x=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
if(!x.propertyIncidents?.some(e=>e.incidentId==="M54-1"&&e.status==="ACKNOWLEDGED")||
   !x.workloads?.some(w=>w.workloadId==="pef-property"&&w.state==="RUNNING"))
 process.exit(1);
NODE
node - "$unit" "$root/after.json" <<'NODE' >"${PEF_M54_EVIDENCE:-$root/out.json}"
const fs=require("node:fs"),x=JSON.parse(fs.readFileSync(process.argv[3]));
console.log(JSON.stringify({kind:"PEF_M54_SYSTEMD_CI_V1",status:"LAB_PASS",ok:true,
 unit:process.argv[2],runtime:"ACTUAL_SYSTEMD_PID1_GITHUB_HOSTED",
 checks:{UNIT_VERIFIED:true,SERVICE_STARTED:true,DURABLE_ALERT_ACK:true,
  SYSTEMD_SIGKILL_RESTART:true,JOURNAL_RECOVERED:true,PROPERTY_WORKER_RECOVERED:true},
 backend:x.backend,bootManager:"systemd",nodeChildReal:true,
 osRebootValidated:false,physicalValidated:false,deviceBackendEnabled:false}));
NODE
echo "M54_SYSTEMD_LAB_PASS"

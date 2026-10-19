#!/usr/bin/env bash
# Only invoked inside pre-existing ARM64 Lima virtual machine with explicit operator permission.
set -Eeuo pipefail
action="${1:-}";repo="${2:-}"
[[ "$(uname -s)" == Linux && "$(uname -m)" == aarch64 ]] ||
  { echo "M54_GUEST_BLOCKED:not Linux ARM64" >&2;exit 78; }
systemd-detect-virt --vm >/dev/null ||
  { echo "M54_GUEST_BLOCKED:VM not detected" >&2;exit 78; }
[[ "$(cat /proc/1/comm)" == systemd && -f "$repo/src/runtime/m5-systemd-unit.js" ]] ||
  { echo "M54_GUEST_BLOCKED:systemd or repo mount missing" >&2;exit 78; }
command -v node >/dev/null && [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 20 ]] ||
  { echo "M54_GUEST_BLOCKED:Node >=20 required inside guest" >&2;exit 78; }
user="$(id -un)";group="$(id -gn)"
[[ "$user" =~ ^[a-z_][a-z0-9_-]*$ && "$group" =~ ^[a-z_][a-z0-9_-]*$ && "$user" != root ]] ||
  { echo "M54_GUEST_BLOCKED:unprivileged VM user required" >&2;exit 78; }
name="pef-m54-lab.service"
base="$HOME/.local/share/pef-m54-vm"
release="$base/releases/v1"
unit="/etc/systemd/system/$name"
check_service(){
  sudo -n systemctl is-active --quiet "$name" || return 1
  curl --silent --fail --max-time 2 -H "x-pef-token: $(cat "$base/operator-token")" \
    http://127.0.0.1:18791/state
}
case "$action" in
 prepare)
  command -v npm >/dev/null || exit 78
  [[ ! -e "$base" ]] || { echo "M54_GUEST_BLOCKED:existing VM test scope; no overwrite" >&2;exit 78; }
  mkdir -p "$base/releases" "$base/data";chmod 700 "$base" "$base/data"
  temp="$(mktemp -d -t pef-m54-stage-XXXXXXXX)"
  trap 'rm -rf -- "$temp"' EXIT
  node "$repo/bin/pef-m5-install.js" install --root "$temp" --version v1 >/dev/null
  node "$repo/bin/pef-m5-install.js" verify --root "$temp" >/dev/null
  cp -a "$temp/releases/v1" "$release"
  chmod -R u+rwX,go-rwx "$release"
  node - "$release" <<'NODE'
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const dir=process.argv[2],manifest=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json")));
for(const f of manifest.files){
 const bytes=fs.readFileSync(path.join(dir,f.path));
 if(bytes.length!==f.bytes||crypto.createHash("sha256").update(bytes).digest("hex")!==f.sha256)throw Error("M54_RELEASE_COPY_TAMPERED");
}
NODE
  node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))' >"$base/operator-token"
  chmod 600 "$base/operator-token"
  echo "PEF_EDGE_TOKEN=$(cat "$base/operator-token")" >"$base/edge.env";chmod 600 "$base/edge.env"
  cat > "$base/edge.json" <<EOF
{"schemaVersion":1,"backend":"virtual-lab","identity":{"siteId":"m54-guest","deviceId":"m54-vm-edge","configRevision":"r1"},"storageDir":"$base/data","http":{"host":"127.0.0.1","port":18791},"sampleIntervalMs":250,"workload":{"enabled":true,"profile":"property","reconcileMs":200},"journal":{"capacityBytes":65536,"controlReserveBytes":4096},"wan":{"primary":{"link":true,"upstream":false},"backup":{"link":true,"upstream":false}}}
EOF
  chmod 600 "$base/edge.json"
  node - "$(readlink -f "$(command -v node)")" "$release" "$base/edge.json" "$base/edge.env" "$base/data" "$user" "$group" <<'NODE' >"$base/pef-m54.service"
const {renderLabServiceUnit}=require("./src/runtime/m5-systemd-unit.js");
process.stdout.write(renderLabServiceUnit({nodePath:process.argv[2],releaseDir:process.argv[3],
 configFile:process.argv[4],envFile:process.argv[5],dataDir:process.argv[6],
 user:process.argv[7],group:process.argv[8]}));
NODE
  # User explicitly approved the VM-only service test. Never install a Mac service.
  sudo -n install -m 0644 "$base/pef-m54.service" "$unit"
  sudo -n systemctl daemon-reload
  sudo -n systemctl enable --now "$name" >/dev/null
  for i in {1..80};do if check_service >"$base/state-before.json" 2>/dev/null;then break;fi;sleep .2;done
  check_service >"$base/state-before.json"
  curl -fsS -H "x-pef-token: $(cat "$base/operator-token")" -H "content-type: application/json" \
    -d '{"operation":"ALERT","incidentId":"M54-VM-1","assetId":"PUMP-01","severity":"WARNING"}' \
    http://127.0.0.1:18791/property/incidents >"$base/open.json"
  curl -fsS -H "x-pef-token: $(cat "$base/operator-token")" -H "content-type: application/json" \
    -d '{"operation":"ACK","incidentId":"M54-VM-1"}' \
    http://127.0.0.1:18791/property/incidents >"$base/ack.json"
  node - "$base" <<'NODE'
const fs=require("node:fs"),path=require("node:path");
const base=process.argv[2],before=JSON.parse(fs.readFileSync(path.join(base,"state-before.json")));
for(const n of ["open.json","ack.json"]){
 const x=JSON.parse(fs.readFileSync(path.join(base,n)));
 if(x.accepted!==true||x.fsyncCompleted!==true)throw Error("M54_DURABILITY_INCORRECT");
}
fs.writeFileSync(path.join(base,"pre-reboot.json"),JSON.stringify({
 bootId:fs.readFileSync("/proc/sys/kernel/random/boot_id","utf8").trim(),
 sessionId:before.identity.sessionId,incidentId:"M54-VM-1"})+"\n",{mode:0o600});
NODE
  echo 'M54_GUEST_PREPARED=LAB_PASS_VM_REBOOT_NOT_RUN';;
 verify)
  [[ -f "$base/pre-reboot.json" && -f "$unit" ]] ||
    { echo "M54_GUEST_NOT_PREPARED" >&2;exit 78; }
  current="$(check_service)"
  node - "$base/pre-reboot.json" "$current" <<'NODE'
const fs=require("node:fs"),prev=JSON.parse(fs.readFileSync(process.argv[2])),
  cur=JSON.parse(process.argv[3]),bootId=fs.readFileSync("/proc/sys/kernel/random/boot_id","utf8").trim();
const checks={VM_OS_BOOT_ID_CHANGED:bootId!==prev.bootId,
  SERVICE_AUTOSTARTED:cur.workloads?.some(w=>w.workloadId==="pef-property"&&w.state==="RUNNING"),
  NEW_EDGE_SESSION:cur.identity?.sessionId!==prev.sessionId,
  JOURNAL_PERSISTED:cur.propertyIncidents?.some(i=>i.incidentId===prev.incidentId&&i.status==="ACKNOWLEDGED"),
  WAN_OFFLINE_LOCAL_SERVICE:cur.network?.connectivity==="LOCAL_ONLY"};
const ok=Object.values(checks).every(Boolean);
console.log(JSON.stringify({kind:"PEF_M54_LIMA_OS_BOOT_V1",status:ok?"LAB_PASS":"LAB_FAIL",
 ok,checks,platform:process.platform,arch:process.arch,
 vmRebootValidated:ok,physicalPowerCutValidated:false,deviceValidated:false},null,2));
if(!ok)process.exitCode=1;
NODE
 ;;
 *)echo "M54_UNKNOWN_ACTION" >&2;exit 2;;
esac

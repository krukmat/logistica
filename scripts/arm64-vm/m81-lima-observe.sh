#!/usr/bin/env bash
# M8.1.A read-only Lima inspection. No create/start/stop/reboot/sudo/network changes.
set -Eeuo pipefail
blocked(){ echo "M81_LIMA_PREFLIGHT_BLOCKED:$*" >&2; exit 78; }
[[ "${PEF_M81_VM_ACK:-}" == "EXPLICIT_READ_ONLY_LIMA_M81" ]] ||
 blocked "explicit VM-only read permission required"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] ||
 blocked "Mac Apple Silicon required"
[[ "${1:-}" == r28s-1g && "$#" -eq 1 ]] ||
 blocked "only the pre-existing r28s-1g profile is accepted"
command -v limactl >/dev/null 2>&1 || blocked "limactl not installed"
command -v node >/dev/null 2>&1 || blocked "Node >=20 required on Mac"
vm="pef-r28s-1g"
# Never depend on limactl shell to implicitly start a stopped/nonexistent VM.
inventory="$(limactl list --json 2>/dev/null)" || blocked "Lima inventory unavailable"
printf '%s\n' "$inventory" | node -e '
let raw="";process.stdin.on("data",x=>raw+=x);
process.stdin.on("end",()=>{
 let instances=[];
 try{const decoded=JSON.parse(raw);
   instances=Array.isArray(decoded)?decoded:
     Array.isArray(decoded.instances)?decoded.instances:[decoded];
 }catch{try{instances=raw.trim().split(/\n/).map(x=>JSON.parse(x));}
       catch{process.exit(78);}}
 const vm=instances.find(x=>x&&x.name==="pef-r28s-1g");
 if(!vm||String(vm.status).toLowerCase()!=="running")process.exit(78);
});' || blocked "VM absent/stopped or unparseable Lima inventory: no implicit start"
root="$(cd "$(dirname "$0")/../.." && pwd)"
# The project path is mounted read-only by existing Lima policy.
limactl shell "$vm" env PEF_M81_OBSERVE_ACK=EXPLICIT_READ_ONLY_LIMA_M81 \
 node "$root/bin/pef-m81-preflight.js" --guest-readonly

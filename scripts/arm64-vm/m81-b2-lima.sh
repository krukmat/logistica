#!/usr/bin/env bash
# M8.1.B2 operator entry: targets ONLY already-running pef-r28s-1g Lima guest.
# Never creates/starts/restarts/stops the guest and never touches Mac system services.
set -Eeuo pipefail
blocked(){ echo "M81_B2_LIMA_BLOCKED:$*" >&2; exit 78; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
[[ $# -eq 1 && ( "$1" == --plan || "$1" == --run ) ]] ||
 blocked "Usage: m81-b2-lima.sh --plan|--run"
if [[ "$1" == --plan ]];then
 exec node "$root/bin/pef-m81-b2.js" --plan
fi
[[ "${PEF_M81_B2_MAC_ACK:-}" == EXPLICIT_EXISTING_RUNNING_LIMA_B2 ]] ||
 blocked "separate Mac operator authorization absent"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] ||
 blocked "Apple Silicon Mac required"
command -v node >/dev/null && command -v limactl >/dev/null ||
 blocked "Node and Lima required"
# Check exact named running guest. No implicit Lima start on missing/stopped guest.
inventory="$(limactl list --json 2>/dev/null)" ||
 blocked "cannot query Lima inventory"
printf '%s\n' "$inventory" | node -e '
let raw="";process.stdin.on("data",x=>raw+=x);
process.stdin.on("end",()=>{try{
 let instances;try{const v=JSON.parse(raw);instances=Array.isArray(v)?v:
   Array.isArray(v.instances)?v.instances:[v];}
 catch{instances=raw.trim().split(/\n/).map(x=>JSON.parse(x));}
 const guest=instances.find(x=>x&&x.name==="pef-r28s-1g");
 if(!guest||String(guest.status).toLowerCase()!=="running")process.exitCode=78;
}catch{process.exitCode=78;}});
' || blocked "exact existing Lima guest is absent or stopped"
# Explicit guest authorization is separate from Mac approval and must pass B1.
# Root privileges exist only inside the named guest via sudo -n (no prompt).
limactl shell pef-r28s-1g sudo -n env \
 PEF_M81_B2_ACK=EXPLICIT_VM_ROOT_SANDBOX_M81B2 \
 PEF_M81_ISOLATION_ACK=EXPLICIT_M81_LIMA_ISOLATED_WORKER \
 PEF_M81_VM_ID=pef-r28s-1g \
 PEF_M81_ISOLATION_SCOPE=M81_LIMA_VM \
 bash "$root/scripts/arm64-vm/m81-b2-guest.sh" --run

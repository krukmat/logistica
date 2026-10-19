#!/usr/bin/env bash
# Operator-opt-in. Targets only pre-existing pef-r28s-1g Lima instance; never Mac services.
set -Eeuo pipefail
action="${1:-}";profile="${2:-}"
[[ "$profile" == r28s-1g && "${PEF_M54_VM_ACK:-}" == "EXPLICIT_LIMA_VM_SERVICE_TEST" ]] ||
  { echo "M54_LIMA_BLOCKED:explicit ack and existing r28s-1g required" >&2;exit 78; }
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] ||
  { echo "M54_LIMA_BLOCKED:Mac ARM64 only" >&2;exit 78; }
command -v limactl >/dev/null || { echo "M54_LIMA_BLOCKED:limactl unavailable" >&2;exit 78; }
root="$(cd "$(dirname "$0")/../.." && pwd)"
vm="pef-$profile"
case "$action" in
 prepare|verify)
  limactl shell "$vm" bash "$root/scripts/arm64-vm/guest-m54-service.sh" "$action" "$root";;
 reboot)
  # Actual guest OS shutdown/start, NOT a physical powercut. No new VM created.
  echo "M54_VM_REBOOT:stopping and starting only $vm"
  limactl stop "$vm"
  limactl start "$vm"
  limactl shell "$vm" bash "$root/scripts/arm64-vm/guest-m54-service.sh" verify "$root";;
 *)
  echo "Usage: PEF_M54_VM_ACK=EXPLICIT_LIMA_VM_SERVICE_TEST bash scripts/arm64-vm/m54-lima-service.sh prepare|reboot|verify r28s-1g" >&2
  exit 2;;
esac

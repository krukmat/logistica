#!/usr/bin/env bash
set -euo pipefail
action="$1";root="$2";profile="$3"
[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "aarch64" ]] || exit 78
systemd-detect-virt --vm >/dev/null || exit 78
[[ -f "$root/bin/pef-arm64-d3.js" ]] || exit 78
case "$profile" in r28s-1g|r28s-768m|r28s-512m) ;; *) exit 2;; esac
state="$HOME/.local/share/pef-arm64-lab"
mkdir -p "$state"
cd "$root"
case "$action" in
 prepare)
  if [[ -e "$state/d3-$profile" ]];then
   echo "D3_EXISTING_RUN: preserve previous evidence. Rename guest d3-$profile manually if a fresh run is required." >&2
   exit 3
  fi
  nohup node bin/pef-arm64-d3.js --mode writer --profile "$profile" --base-dir "$state" > "$state/d3-$profile.log" 2>&1 < /dev/null &
  for _ in $(seq 1 50);do
   if [[ -f "$state/d3-$profile/prepared.json" ]];then
    node bin/pef-arm64-d3.js --mode inspect --profile "$profile" --base-dir "$state"
    exit $?
   fi
   sleep 0.2
  done
  echo "D3_WRITER_FAILED_OR_NOT_READY" >&2;cat "$state/d3-$profile.log" >&2;exit 1
  ;;
 inspect)
  node bin/pef-arm64-d3.js --mode inspect --profile "$profile" --base-dir "$state"
  ;;
 verify)
  node bin/pef-arm64-d3.js --mode verify --profile "$profile" --base-dir "$state" --host-force-stop-observed
  ;;
 export)
  cat "$state/d3-$profile/recovery.json"
  ;;
 *) echo "D3_UNKNOWN_ACTION" >&2;exit 2;;
esac

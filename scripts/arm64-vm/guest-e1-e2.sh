#!/usr/bin/env bash
# E1/E2 run inside the named Lima VM; never changes Mac/physical NIC or host routes.
set -euo pipefail
action="$1";root="$2";profile="$3"
[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "aarch64" ]] || exit 78
systemd-detect-virt --vm >/dev/null || exit 78
[[ -r "$root/package.json" ]] || exit 78
case "$profile" in r28s-1g|r28s-768m|r28s-512m) ;; *)exit 2;;esac
state="$HOME/.local/share/pef-arm64-lab";mkdir -p "$state"
cd "$root"
case "$action" in
 e1) node bin/pef-arm64-e1.js --profile "$profile" --strict --output "$state/$profile-e1.json";;
 e2)
  node bin/pef-arm64-e2.js --profile "$profile" --strict --count 2000 --payload-kib 1 \
    --base-dir "$state" --output "$state/$profile-e2-1k.json"
  node bin/pef-arm64-e2.js --profile "$profile" --strict --count 1000 --payload-kib 4 \
    --base-dir "$state" --output "$state/$profile-e2-4k.json"
  ;;
 e1-export) cat "$state/$profile-e1.json";;
 e2-export) cat "$state/$profile-e2-1k.json";cat "$state/$profile-e2-4k.json";;
 *) echo "E1_E2_UNKNOWN_ACTION" >&2;exit 2;;
esac

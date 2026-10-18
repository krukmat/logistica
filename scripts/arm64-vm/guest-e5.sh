#!/usr/bin/env bash
set -euo pipefail
action="$1";root="$2";profile="$3"
[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "aarch64" ]] || exit 78
systemd-detect-virt --vm >/dev/null || exit 78
[[ -r "$root/package.json" ]] || exit 78
case "$profile" in r28s-1g|r28s-768m|r28s-512m) ;; *)exit 2;;esac
state="$HOME/.local/share/pef-arm64-lab"
cd "$root"
case "$action" in
 evaluate)
  node bin/pef-arm64-e5.js --profile "$profile" \
   --d4 "$state/$profile-comparison.json" \
   --e1 "$state/$profile-e1.json" --e2-small "$state/$profile-e2-1k.json" \
   --e2-large "$state/$profile-e2-4k.json" --output "$state/$profile-e5.json"
  ;;
 export) cat "$state/$profile-e5.json";;
 *)exit 2;;
esac

#!/usr/bin/env bash
set -euo pipefail
root="$1";profile="$2"
[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "aarch64" ]] || exit 78
systemd-detect-virt --vm >/dev/null || exit 78
[[ -f "$root/package.json" ]] || exit 78
case "$profile" in r28s-1g|r28s-768m|r28s-512m) ;; *)exit 2;;esac
state="$HOME/.local/share/pef-arm64-lab"
cd "$root"
node bin/pef-arm64-compare.js --profile "$profile" \
 --core "$state/$profile.json" --network "$state/$profile-network.json" \
 --recovery "$state/d3-$profile/recovery.json" --load "$state/$profile-load.json" \
 --output "$state/$profile-comparison.json"

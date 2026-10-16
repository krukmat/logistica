#!/usr/bin/env bash
set -euo pipefail
root="$1";profile="$2"
[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "aarch64" ]] || exit 78
systemd-detect-virt --vm >/dev/null || exit 78
[[ -f "$root/package.json" ]] || exit 78
case "$profile" in r28s-1g|r28s-768m|r28s-512m) ;; *)exit 2;;esac
state="$HOME/.local/share/pef-arm64-lab";mkdir -p "$state"
cd "$root"
node bin/pef-arm64-vm.js --profile "$profile" --count 2000 --require-arm64 --enforce-guest-limits \
  --base-dir "$state" --output "$state/$profile-load.json"

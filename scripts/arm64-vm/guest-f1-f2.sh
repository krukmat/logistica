#!/usr/bin/env bash
# W1.10.F1/F2: guest user session only; explicit bounded 100k workload, no root.
set -euo pipefail
action="$1"; root="$2";profile="$3"
[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "aarch64" ]] || { echo "F1_F2_ARM64_LINUX_REQUIRED" >&2;exit 78; }
systemd-detect-virt --vm >/dev/null || { echo "F1_F2_VIRTUAL_GUEST_ONLY" >&2;exit 78; }
[[ -r "$root/package.json" ]] || exit 78
case "$profile" in r28s-1g|r28s-768m|r28s-512m) ;; *)exit 2;;esac
state="$HOME/.local/share/pef-arm64-lab"
mkdir -p "$state";cd "$root"
case "$action" in
 f1)
  node bin/pef-arm64-f1.js --mode full --profile "$profile" \
   --require-constrained --ack R28S_1GB_STAGED_TEST --base-dir "$state" \
   --output "$state/$profile-f1.json"
  ;;
 f2)
  node bin/pef-arm64-f2.js --profile "$profile" --f1 "$state/$profile-f1.json" \
   --e2-small "$state/$profile-e2-1k.json" \
   --e2-large "$state/$profile-e2-4k.json" --output "$state/$profile-f2.json"
  ;;
 f1-export) cat "$state/$profile-f1.json";;
 f2-export) cat "$state/$profile-f2.json";;
 *) echo "F1_F2_UNKNOWN_ACTION" >&2;exit 2;;
esac

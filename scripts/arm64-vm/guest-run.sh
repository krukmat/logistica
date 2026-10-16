#!/usr/bin/env bash
set -euo pipefail
root="$1";profile="$2"
[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "aarch64" ]] || { echo "ARM64_GUEST_REQUIRED" >&2;exit 78; }
command -v systemd-detect-virt >/dev/null && systemd-detect-virt --vm >/dev/null || { echo "VM_REQUIRED" >&2;exit 78; }
[[ -f "$root/package.json" ]] || { echo "LIMA_READONLY_REPO_MOUNT_MISSING" >&2;exit 78; }
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 20 ]];then
 sudo -n apt-get update -qq
 sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs npm
fi
[[ "$(node -p 'process.arch')" == "arm64" ]] || exit 78
state="$HOME/.local/share/pef-arm64-lab";mkdir -p "$state";cd "$root"
npm test
npm run traces:check
npm run ports:conformance
node bin/pef-arm64-vm.js --profile "$profile" --require-arm64 --enforce-guest-limits --base-dir "$state" --output "$state/$profile.json"

#!/usr/bin/env bash
set -euo pipefail
action="$1";profile="$2"
case "$profile" in r28s-1g) mem="1";; r28s-768m) mem="0.75";; r28s-512m) mem="0.5";; *) echo "UNKNOWN_ARM64_PROFILE" >&2;exit 2;;esac
[[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] || { echo "MAC_APPLE_SILICON_REQUIRED" >&2;exit 78; }
command -v limactl >/dev/null || { echo "Install Lima with brew install lima" >&2;exit 78; }
name="pef-$profile";root="$(cd "$(dirname "$0")/../.." && pwd)"
case "$action" in
 create) limactl start --name "$name" --arch=aarch64 --vm-type=vz --cpus=4 --memory="$mem" --disk=16 template:debian;;
 run) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-run.sh" "$root" "$profile";;
 stop) limactl stop "$name";;
 shell) limactl shell "$name";;
 *) echo "Usage: bash scripts/arm64-vm/lima.sh create|run|stop|shell r28s-1g" >&2;exit 2;;
esac

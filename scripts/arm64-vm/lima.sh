#!/usr/bin/env bash
set -euo pipefail
action="$1";profile="$2"
case "$profile" in r28s-1g) mem="1";; r28s-768m) mem="0.75";; r28s-512m) mem="0.5";; *) echo "UNKNOWN_ARM64_PROFILE" >&2;exit 2;;esac
[[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] || { echo "MAC_APPLE_SILICON_REQUIRED" >&2;exit 78; }
command -v limactl >/dev/null || { echo "Install Lima with brew install lima" >&2;exit 78; }
name="pef-$profile";root="$(cd "$(dirname "$0")/../.." && pwd)"
case "$action" in
 f1) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-f1-f2.sh" f1 "$root" "$profile";;
 f2) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-f1-f2.sh" f2 "$root" "$profile";;
 f1-export) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-f1-f2.sh" f1-export "$root" "$profile";;
 f2-export) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-f1-f2.sh" f2-export "$root" "$profile";;
 e5) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-e5.sh" evaluate "$root" "$profile";;
 e5-export) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-e5.sh" export "$root" "$profile";;
 e1) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-e1-e2.sh" e1 "$root" "$profile";;
 e2) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-e1-e2.sh" e2 "$root" "$profile";;
 e1-export) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-e1-e2.sh" e1-export "$root" "$profile";;
 e2-export) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-e1-e2.sh" e2-export "$root" "$profile";;
 load) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-load.sh" "$root" "$profile";;
 d4-compare) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-compare.sh" "$root" "$profile";;
 d4-export) limactl shell "$name" bash -c 'cat "$HOME/.local/share/pef-arm64-lab/$1-comparison.json"' _ "$profile";;
 d3-prepare) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-d3.sh" prepare "$root" "$profile";;
 d3-force-stop)
  limactl shell "$name" bash "$root/scripts/arm64-vm/guest-d3.sh" inspect "$root" "$profile"
  echo "Force-stopping ONLY Lima instance $name; no physical power-cut claim."
  limactl stop --force "$name";;
 d3-verify)
  limactl start "$name"
  limactl shell "$name" bash "$root/scripts/arm64-vm/guest-d3.sh" verify "$root" "$profile";;
 d3-export) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-d3.sh" export "$root" "$profile";;
 create) limactl start --name "$name" --arch=aarch64 --vm-type=vz --cpus=4 --memory="$mem" --disk=16 template:debian;;
 run) limactl shell "$name" bash "$root/scripts/arm64-vm/guest-run.sh" "$root" "$profile";;
 stop) limactl stop "$name";;
 shell) limactl shell "$name";;
 *) echo "Usage: bash scripts/arm64-vm/lima.sh create|run|stop|shell r28s-1g" >&2;exit 2;;
esac

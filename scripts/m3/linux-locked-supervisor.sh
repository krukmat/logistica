#!/usr/bin/env bash
set -euo pipefail
# Lab Linux only: kernel advisory flock held for the *whole supervisor lifetime*.
# No route mutations/root. Does not protect against callers that bypass the wrapper.
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "M3_LINUX_FLOCK_ONLY" >&2; exit 78
fi
if [[ "$#" != 1 ]]; then echo "Usage: bash scripts/m3/linux-locked-supervisor.sh /absolute/config.json" >&2; exit 64; fi
command -v flock >/dev/null || { echo "M3_FLOCK_UNAVAILABLE" >&2; exit 78; }
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CFG="$1"
STORAGE="$(node -e '
 const fs=require("node:fs"),path=require("node:path");
 const {validateEdgeConfig}=require(process.argv[1]+"/src/runtime/edge-config.js");
 const file=process.argv[2];
 if(!path.isAbsolute(file))throw Error("M3_ABSOLUTE_CONFIG_REQUIRED");
 const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink())throw Error("M3_CONFIG_UNSAFE");
 process.stdout.write(validateEdgeConfig(JSON.parse(fs.readFileSync(file,"utf8"))).storageDir);
' "$ROOT" "$CFG")"
# Lock the validated DIRECTORY fd; avoid creating a lock-file symlink/TOCTOU target.
exec 9<"$STORAGE"
if ! flock -n 9; then echo "M3_KERNEL_LOCK_BUSY" >&2; exit 75; fi
exec node "$ROOT/bin/pef-m3-supervisor.js" --config "$CFG"

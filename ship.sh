#!/usr/bin/env bash
# Convenience wrapper — the real orchestrator lives in ../spk/ship.sh and
# drives ALL KV apps (kvtube, kvdownload, kvmusic, kvnetflix, kvsynology).
# This shim defaults to kvtube so existing muscle memory keeps working:
#
#   ./ship.sh all 4.9.0 1.0.0-41      ==  ../spk/ship.sh kvtube all 4.9.0 1.0.0-41
#   ./ship.sh tv tv-v1.1.0            ==  ../spk/ship.sh kvtube tv tv-v1.1.0
set -euo pipefail
SPK_SHIP="$(cd "$(dirname "$0")/../spk" && pwd)/ship.sh"
[ -f "$SPK_SHIP" ] || { echo "ERROR: $SPK_SHIP not found" >&2; exit 1; }
exec bash "$SPK_SHIP" "${@:+kvtube}" "$@"

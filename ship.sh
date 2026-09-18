#!/usr/bin/env bash
# Convenience wrapper for kvtube — delegates to ../spk/ship.sh
# Usage:
#   ./ship.sh push-all [img-ver] [spk-ver]
#   ./ship.sh all [img-ver] [spk-ver]
#   ./ship.sh code [commit-msg]
#   ./ship.sh tv <tag>
#   ./ship.sh phone <tag>
set -euo pipefail
SPK_SHIP="$(cd "$(dirname "$0")/../spk" && pwd)/ship.sh"
[ -f "$SPK_SHIP" ] || { echo "ERROR: $SPK_SHIP not found" >&2; exit 1; }

if [ "${1:-}" = "kvtube" ] || [ "${1:-}" = "--help" ]; then
  exec bash "$SPK_SHIP" "$@"
else
  exec bash "$SPK_SHIP" kvtube "$@"
fi

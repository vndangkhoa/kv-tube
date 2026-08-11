#!/bin/bash
# Backward-compatible alias for start.sh
exec "$(dirname "$0")/start.sh" "$@"

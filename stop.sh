#!/bin/bash
# KV-Tube stop script
# Stops the backend and frontend started by ./start.sh (launch.sh).

set -u

cd "$(dirname "$0")"
ROOT=$(pwd)

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
err()  { echo -e "${RED}[X]${NC} $1"; }

stopped=0

for svc in backend frontend; do
    pidfile="$ROOT/logs/$svc.pid"
    [ -f "$pidfile" ] || continue
    pid=$(cat "$pidfile" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        log "Stopping $svc (pid $pid)..."
        # Services were started with setsid, so kill the whole process group
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null
        stopped=1
    fi
    rm -f "$pidfile"
done

# Fallback: clean up orphans (e.g. stale pidfiles) scoped to this project
pkill -f "$ROOT/backend/kv-tube" 2>/dev/null
pkill -f "$ROOT/frontend/node_modules/.bin/next" 2>/dev/null
pkill -f "$ROOT/frontend/.next/standalone/server.js" 2>/dev/null

if [ "$stopped" -eq 1 ]; then
    sleep 1
    log "KV-Tube stopped"
else
    log "KV-Tube is not running"
fi

#!/bin/bash
# KV-Tube launcher — self-contained (no start.sh dependency).
#   ./launch.sh [dev|prod]      (default: dev)
#
# dev:  builds the backend binary and runs it (debug Gin), frontend runs
#       `next dev` with hot reload.
# prod: builds both, backend with GIN_MODE=release, frontend via `next start`.
#
# Processes are started with setsid (when available) so stop.sh can kill the
# whole process group. PIDs are written to logs/{backend,frontend}.pid.

set -u

cd "$(dirname "$0")"
ROOT=$(pwd)

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log() { echo -e "${GREEN}[+]${NC} $1"; }
err() { echo -e "${RED}[X]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

MODE=${1:-dev}
if [ "$MODE" != "dev" ] && [ "$MODE" != "prod" ]; then
    err "Unknown mode: '$MODE' (use 'dev' or 'prod')"
    exit 1
fi

BACKEND_PORT=8080  # fixed: frontend rewrites /api -> http://localhost:8080
FRONTEND_PORT=${FRONTEND_PORT:-3000}

LOGDIR="$ROOT/logs"
mkdir -p "$LOGDIR"

echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           KV-Tube Launcher            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo -e "${YELLOW}Mode: ${MODE}${NC}"

# Stop anything already running (idempotent, scoped to this project)
"$ROOT/stop.sh" >/dev/null 2>&1

# ---- Dependency checks ----
log "Checking dependencies..."
if ! command -v go >/dev/null 2>&1; then
    err "Go is not installed (required to build the backend)"
    exit 1
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    err "Node.js/npm is not installed (required for the frontend)"
    exit 1
fi
if ! command -v yt-dlp >/dev/null 2>&1; then
    warn "yt-dlp not found on PATH (backend will try bundled locations)"
fi

# ---- Start backend ----
log "Building backend..."
if ! (cd backend && go build -o kv-tube .); then
    err "Backend build failed"
    exit 1
fi

BACKEND_LOG="$LOGDIR/backend.log"
BACKEND_PIDFILE="$LOGDIR/backend.pid"
rm -f "$BACKEND_PIDFILE"

start_detached() {
    # $1=name $2=logfile $3=pidfile, rest = command
    local name=$1 logfile=$2 pidfile=$3
    shift 3
    if command -v setsid >/dev/null 2>&1; then
        setsid "$@" >"$logfile" 2>&1 &
    else
        "$@" >"$logfile" 2>&1 &
    fi
    echo $! > "$pidfile"
    log "$name started (pid $!)"
}

if [ "$MODE" = "prod" ]; then
    start_detached backend "$BACKEND_LOG" "$BACKEND_PIDFILE" \
        env GIN_MODE=release ./backend/kv-tube
else
    start_detached backend "$BACKEND_LOG" "$BACKEND_PIDFILE" \
        ./backend/kv-tube
fi

log "Waiting for backend on :$BACKEND_PORT..."
BACKEND_OK=0
for i in $(seq 1 20); do
    if curl -s "http://localhost:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
        BACKEND_OK=1
        break
    fi
    sleep 1
done
if [ "$BACKEND_OK" -ne 1 ]; then
    err "Backend failed to start. Check $BACKEND_LOG"
    exit 1
fi
log "Backend is healthy"

# ---- Start frontend ----
if [ ! -d "$ROOT/frontend/node_modules" ]; then
    log "Installing frontend dependencies (first run)..."
    (cd frontend && npm install) || { err "npm install failed"; exit 1; }
fi

FRONTEND_LOG="$LOGDIR/frontend.log"
FRONTEND_PIDFILE="$LOGDIR/frontend.pid"
rm -f "$FRONTEND_PIDFILE"

if [ "$MODE" = "prod" ]; then
    log "Building frontend (next build)..."
    if ! (cd frontend && npm run build >"$LOGDIR/frontend-build.log" 2>&1); then
        err "Frontend build failed. Check $LOGDIR/frontend-build.log"
        exit 1
    fi
    start_detached frontend "$FRONTEND_LOG" "$FRONTEND_PIDFILE" \
        env PORT="$FRONTEND_PORT" npm --prefix "$ROOT/frontend" run start
else
    start_detached frontend "$FRONTEND_LOG" "$FRONTEND_PIDFILE" \
        env PORT="$FRONTEND_PORT" npm --prefix "$ROOT/frontend" run dev
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        KV-Tube is running!            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Frontend:${NC} http://localhost:${FRONTEND_PORT}"
echo -e "  ${CYAN}Backend:${NC}  http://localhost:${BACKEND_PORT}"
echo -e "  ${YELLOW}Logs:${NC}"
echo -e "    Backend:  $BACKEND_LOG"
echo -e "    Frontend: $FRONTEND_LOG"
echo ""
echo -e "  ${YELLOW}To stop:${NC} ./stop.sh  (or Ctrl+C)"
echo ""

cleanup() {
    echo ""
    log "Stopping KV-Tube..."
    for svc in backend frontend; do
        pidfile="$LOGDIR/$svc.pid"
        [ -f "$pidfile" ] || continue
        pid=$(cat "$pidfile" 2>/dev/null)
        if [ -n "$pid" ]; then
            kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null
        fi
        rm -f "$pidfile"
    done
    log "Stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

wait

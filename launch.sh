#!/bin/bash
# KV-Tube launcher — self-contained
#   ./launch.sh [dev|prod]      (default: dev)
#   ./start.sh  [dev|prod]      (alias)
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

LOGDIR="$ROOT/logs"
mkdir -p "$LOGDIR"

# Ensure .env exists
if [ ! -f "$ROOT/.env" ] && [ -f "$ROOT/.env.example" ]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    warn "Created .env from .env.example"
fi

# Determine ports: respect environment variables first, then .env, then defaults
ENV_PORT=""
if [ -f "$ROOT/.env" ]; then
    ENV_PORT=$(grep -E '^[[:space:]]*PORT=' "$ROOT/.env" 2>/dev/null | cut -d '=' -f2- | tr -d ' "\r\n' || true)
fi

BACKEND_PORT_EXPLICIT=0
if [ -n "${BACKEND_PORT:-}" ] || [ -n "${PORT:-}" ]; then
    BACKEND_PORT_EXPLICIT=1
fi

BACKEND_PORT=${BACKEND_PORT:-${PORT:-${ENV_PORT:-8080}}}
FRONTEND_PORT=${FRONTEND_PORT:-3000}

is_port_in_use() {
    local port=$1
    if command -v ss >/dev/null 2>&1; then
        ss -tulpn 2>/dev/null | grep -qE ":$port\b"
    elif command -v lsof >/dev/null 2>&1; then
        lsof -i ":$port" >/dev/null 2>&1
    elif command -v nc >/dev/null 2>&1; then
        nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    else
        (echo > /dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
    fi
}

echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           KV-Tube Launcher            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo -e "${YELLOW}Mode: ${MODE}${NC}"

# Stop anything already running (idempotent, scoped to this project)
"$ROOT/stop.sh" >/dev/null 2>&1

# Check for backend port conflict
if is_port_in_use "$BACKEND_PORT"; then
    if [ "$BACKEND_PORT_EXPLICIT" -eq 1 ]; then
        err "Port $BACKEND_PORT is already in use by another process."
        err "Please free port $BACKEND_PORT or specify a different BACKEND_PORT."
        exit 1
    else
        warn "Default backend port $BACKEND_PORT is already in use by another service on this host."
        # Auto-discover next free port in 8085..8099
        FOUND_PORT=0
        for p in $(seq 8085 8099); do
            if ! is_port_in_use "$p"; then
                BACKEND_PORT=$p
                FOUND_PORT=1
                warn "Automatically selected available backend port: $BACKEND_PORT"
                break
            fi
        done
        if [ "$FOUND_PORT" -ne 1 ]; then
            err "Unable to find an open port between 8085 and 8099. Set BACKEND_PORT manually."
            exit 1
        fi
    fi
fi

# Cleanup handler
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
    "$ROOT/stop.sh" >/dev/null 2>&1
    log "Stopped."
}

cleanup_on_signal() {
    cleanup
    exit 0
}

trap cleanup_on_signal SIGINT SIGTERM

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
        env PORT="$BACKEND_PORT" KVTUBE_DATA_DIR="$ROOT/data" GIN_MODE=release ./backend/kv-tube
else
    start_detached backend "$BACKEND_LOG" "$BACKEND_PIDFILE" \
        env PORT="$BACKEND_PORT" KVTUBE_DATA_DIR="$ROOT/data" ./backend/kv-tube
fi

log "Waiting for backend on :$BACKEND_PORT..."
BACKEND_OK=0
backend_pid=$(cat "$BACKEND_PIDFILE" 2>/dev/null || true)

for i in $(seq 1 20); do
    if [ -n "$backend_pid" ] && ! kill -0 "$backend_pid" 2>/dev/null; then
        err "Backend process (PID $backend_pid) terminated unexpectedly. Check $BACKEND_LOG:"
        [ -f "$BACKEND_LOG" ] && tail -n 20 "$BACKEND_LOG"
        cleanup
        exit 1
    fi
    resp=$(curl -fsS "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null || true)
    if echo "$resp" | grep -q '"status":"ok"'; then
        BACKEND_OK=1
        break
    fi
    sleep 1
done

if [ "$BACKEND_OK" -ne 1 ]; then
    err "Backend failed to respond with healthy status on :$BACKEND_PORT. Check $BACKEND_LOG"
    [ -f "$BACKEND_LOG" ] && tail -n 20 "$BACKEND_LOG"
    cleanup
    exit 1
fi
log "Backend is healthy (http://localhost:$BACKEND_PORT)"

# ---- Start frontend ----
if [ ! -d "$ROOT/frontend/node_modules" ]; then
    log "Installing frontend dependencies (first run)..."
    (cd frontend && npm install) || { err "npm install failed"; cleanup; exit 1; }
fi

FRONTEND_LOG="$LOGDIR/frontend.log"
FRONTEND_PIDFILE="$LOGDIR/frontend.pid"
rm -f "$FRONTEND_PIDFILE"

if [ "$MODE" = "prod" ]; then
    log "Building frontend (next build)..."
    if ! (cd frontend && npm run build >"$LOGDIR/frontend-build.log" 2>&1); then
        err "Frontend build failed. Check $LOGDIR/frontend-build.log"
        cleanup
        exit 1
    fi
    start_detached frontend "$FRONTEND_LOG" "$FRONTEND_PIDFILE" \
        env PORT="$FRONTEND_PORT" BACKEND_URL="http://127.0.0.1:$BACKEND_PORT" npm --prefix "$ROOT/frontend" run start
else
    start_detached frontend "$FRONTEND_LOG" "$FRONTEND_PIDFILE" \
        env PORT="$FRONTEND_PORT" BACKEND_URL="http://127.0.0.1:$BACKEND_PORT" npm --prefix "$ROOT/frontend" run dev
fi

log "Waiting for frontend on :$FRONTEND_PORT..."
frontend_pid=$(cat "$FRONTEND_PIDFILE" 2>/dev/null || true)
FRONTEND_OK=0

for i in $(seq 1 30); do
    if [ -n "$frontend_pid" ] && ! kill -0 "$frontend_pid" 2>/dev/null; then
        err "Frontend process (PID $frontend_pid) terminated unexpectedly. Check $FRONTEND_LOG:"
        [ -f "$FRONTEND_LOG" ] && tail -n 20 "$FRONTEND_LOG"
        cleanup
        exit 1
    fi
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" 2>/dev/null || echo "000")
    if [ "$code" = "200" ] || [ "$code" = "304" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then
        FRONTEND_OK=1
        break
    fi
    sleep 1
done

if [ "$FRONTEND_OK" -ne 1 ]; then
    warn "Frontend is taking longer to respond. Check $FRONTEND_LOG"
else
    log "Frontend is ready (http://localhost:$FRONTEND_PORT)"
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

wait

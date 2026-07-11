#!/bin/bash

cd "$(dirname "$0")"

export PATH="$PATH:$HOME/.local/bin"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()   { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[X]${NC} $1"; }
info()  { echo -e "${BLUE}[*]${NC} $1"; }

MODE="${1:-dev}"

echo ""
log "KV-Tube ($MODE mode)"
echo ""

mkdir -p data logs

[ ! -f .env ] && cp .env.example .env && warn "Created .env from .env.example"

for cmd in go node npm yt-dlp ffmpeg; do
    command -v $cmd &>/dev/null || { err "Missing: $cmd"; exit 1; }
done

./stop.sh 2>/dev/null; sleep 1

cd backend
if [ ! -f kv-tube ]; then
    info "Building backend..."
    go build -o kv-tube . 2>&1
fi
cd ..

screen -dmS kv-backend bash -c "cd backend && GIN_MODE=release exec ./kv-tube 2>&1 | tee logs/backend.log"
log "Backend started (screen: kv-backend)"

for i in $(seq 1 20); do
    if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
        log "Backend ready"
        break
    fi
    [ $i -eq 20 ] && err "Backend failed to start. Check logs/backend.log" && screen -S kv-backend -X quit 2>/dev/null && exit 1
    sleep 1
done

FRONTEND_CMD="PORT=3003 exec npm run dev"
[ "$MODE" = "prod" ] && info "Building frontend..." && cd frontend && npm run build > ../logs/frontend-build.log 2>&1 && cd .. && FRONTEND_CMD="PORT=3003 exec node .next/standalone/server.js"

screen -dmS kv-frontend bash -c "cd frontend && $FRONTEND_CMD 2>&1 | tee logs/frontend.log"
log "Frontend started (screen: kv-frontend)"

info "Waiting for frontend..."
for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3003 2>/dev/null || echo "000")
    if [ "$code" = "200" ]; then
        log "Frontend ready"
        break
    fi
    [ $i -eq 30 ] && warn "Frontend still starting... check logs/frontend.log"
    sleep 1
done

echo ""
log "==================================="
log "  KV-Tube is running!"
log "  Backend:  http://localhost:8080"
log "  Frontend: http://localhost:3003"
log "==================================="
echo ""
echo "  Logs:    logs/{backend,frontend}.log"
echo "  Attach:  screen -r kv-backend | screen -r kv-frontend"
echo "  Stop:    ./stop.sh"
echo ""

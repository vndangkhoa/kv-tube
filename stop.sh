#!/bin/bash

cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping KV-Tube...${NC}"

screen -S kv-backend -X quit 2>/dev/null && echo -e "  ${GREEN}✓${NC} Backend stopped"
screen -S kv-frontend -X quit 2>/dev/null && echo -e "  ${GREEN}✓${NC} Frontend stopped"

fuser -k 8080/tcp 2>/dev/null
fuser -k 3003/tcp 2>/dev/null

sleep 1
echo -e "${GREEN}KV-Tube stopped.${NC}"

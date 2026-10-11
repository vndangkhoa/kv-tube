#!/usr/bin/env bash
#
# build-offline-ios.sh
# 100% Offline Local iOS Native Build Script for KV-Tube on Linux
# No Cloud, No GitHub Actions, No External Internet Required.
#

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_SCRIPTS_DIR="${SCRIPT_DIR}/ios-app/scripts"
DIST_DIR="${SCRIPT_DIR}/ios-app/dist"
OUTPUT_IPA="${DIST_DIR}/KVTube-Ionic.ipa"

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "          KV-Tube 100% Offline Local iOS Build Engine             "
echo "        (Runs completely on this Linux machine — No Cloud)        "
echo "=================================================================="
echo -e "${NC}"

# 1. Run headless Swift unit tests locally
echo -e "${CYAN}==> [Step 1/3] Running local Swift unit tests in Docker...${NC}"
"${IOS_SCRIPTS_DIR}/run-linux-tests.sh"

# 2. Build and package the native iOS .ipa offline
echo -e "${CYAN}==> [Step 2/3] Building native iOS package offline...${NC}"
"${IOS_SCRIPTS_DIR}/build-ionic-ipa.sh"

# 3. Verify output
echo -e "${CYAN}==> [Step 3/3] Verifying generated package...${NC}"
if [ -f "${OUTPUT_IPA}" ]; then
    IPA_SIZE=$(ls -lh "${OUTPUT_IPA}" | awk '{print $5}')
    echo -e "${GREEN}${BOLD}✓ SUCCESS: Offline build completed successfully!${NC}"
    echo -e "  • Package:  ${OUTPUT_IPA}"
    echo -e "  • File Size: ${IPA_SIZE}"
    echo -e "  • Local URL: http://localhost:3250/KVTube-Ionic.ipa"
    echo ""
    echo -e "${YELLOW}How to install onto your physical iPhone:${NC}"
    echo "  1. AltStore / SideStore (Wi-Fi sideloading):"
    echo "     Open AltStore on iPhone -> tap '+' -> select KVTube-Ionic.ipa"
    echo "  2. Sideloadly (USB cable):"
    echo "     Plug iPhone into this computer -> drag KVTube-Ionic.ipa -> Start"
    echo "  3. TrollStore (iOS 14.0 - 16.6.1):"
    echo "     AirDrop / copy KVTube-Ionic.ipa to iPhone -> Install permanently"
else
    echo -e "${RED}Error: Build failed to produce ${OUTPUT_IPA}${NC}"
    exit 1
fi

echo "=================================================================="

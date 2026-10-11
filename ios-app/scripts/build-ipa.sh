#!/usr/bin/env bash
#
# build-ipa.sh
# Builds the KV-Tube iOS .ipa package for physical device sideloading (AltStore, Sideloadly, TrollStore, SideStore).
# Run on macOS, inside Docker-OSX, or in CI/CD.
#

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SCHEME="KVTube"
CONFIGURATION="Release"
DESTINATION="generic/platform=iOS"
OUTPUT_DIR="${IOS_APP_DIR}/dist"
ARCHIVE_PATH="${IOS_APP_DIR}/build/KVTube.xcarchive"
IPA_NAME="KVTube.ipa"

print_banner() {
    echo -e "${CYAN}${BOLD}"
    echo "=================================================================="
    echo "                  KV-Tube iOS .ipa Build Script                   "
    echo "=================================================================="
    echo -e "${NC}"
}

print_help() {
    echo -e "Usage: $(basename "$0") [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --scheme <name>          Xcode scheme (default: KVTube)"
    echo "  --configuration <conf>   Build configuration: Debug | Release (default: Release)"
    echo "  --output-dir <path>      Output directory for .ipa (default: ./dist)"
    echo "  --name <filename>        IPA output filename (default: KVTube.ipa)"
    echo "  -h, --help               Show this help message and exit"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 --configuration Release --output-dir ~/Desktop"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --scheme)
            SCHEME="$2"
            shift 2
            ;;
        --configuration)
            CONFIGURATION="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --name)
            IPA_NAME="$2"
            shift 2
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_help
            exit 1
            ;;
    esac
done

print_banner

if ! command -v xcodebuild >/dev/null 2>&1; then
    echo -e "${RED}Error: xcodebuild is not available in the current PATH.${NC}"
    echo -e "To build a real native iOS ARM64 binary and .ipa, you must run this either:"
    echo -e "  1. On a Mac"
    echo -e "  2. Inside Docker-OSX on this Linux machine (run ./setup-docker-osx.sh)"
    echo -e "  3. via GitHub Actions CI (push to main or trigger workflow_dispatch)"
    exit 1
fi

echo -e "${CYAN}==> Archiving iOS application...${NC}"
mkdir -p "${IOS_APP_DIR}/build"
mkdir -p "${OUTPUT_DIR}"

xcodebuild archive \
    -project "${IOS_APP_DIR}/KVTube.xcodeproj" \
    -scheme "${SCHEME}" \
    -configuration "${CONFIGURATION}" \
    -destination "${DESTINATION}" \
    -archivePath "${ARCHIVE_PATH}" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY="" \
    COMPILER_INDEX_STORE_ENABLE=NO

APP_PATH="${ARCHIVE_PATH}/Products/Applications/KVTube.app"
if [ ! -d "${APP_PATH}" ]; then
    echo -e "${RED}Error: Could not find KVTube.app inside ${ARCHIVE_PATH}/Products/Applications${NC}"
    exit 1
fi

echo -e "${CYAN}==> Packaging .ipa archive...${NC}"
TMP_DIR=$(mktemp -d)
mkdir -p "${TMP_DIR}/Payload"
cp -R "${APP_PATH}" "${TMP_DIR}/Payload/"

cd "${TMP_DIR}"
zip -qr "${OUTPUT_DIR}/${IPA_NAME}" Payload

rm -rf "${TMP_DIR}"

echo -e "${GREEN}${BOLD}✓ Successfully generated: ${OUTPUT_DIR}/${IPA_NAME}${NC}"
echo -e "Size: $(ls -lh "${OUTPUT_DIR}/${IPA_NAME}" | awk '{print $5}')"
echo ""
echo -e "${YELLOW}Install instructions for physical iPhone:${NC}"
echo "  - AltStore / SideStore: Open AltStore -> '+' -> select ${IPA_NAME}"
echo "  - Sideloadly: Drag ${IPA_NAME} into Sideloadly on your computer"
echo "  - TrollStore (iOS 14.0 - 16.6.1): Direct install without 7-day expiration"
echo "=================================================================="

#!/usr/bin/env bash
#
# build-simulator.sh
# Builds the KV-Tube iOS Simulator application bundle using xcodebuild.
# Run on macOS or inside the Docker-OSX macOS virtual machine.
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
DESTINATION="generic/platform=iOS Simulator"
OUTPUT_DIR="${IOS_APP_DIR}/build"
ZIP_ARTIFACT=true
CLEAN=false

print_banner() {
    echo -e "${CYAN}${BOLD}"
    echo "=================================================================="
    echo "             KV-Tube iOS Simulator Build Script                   "
    echo "=================================================================="
    echo -e "${NC}"
}

print_help() {
    echo -e "Usage: $(basename "$0") [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --scheme <name>          Xcode scheme (default: KVTube)"
    echo "  --configuration <conf>   Build configuration: Debug | Release (default: Release)"
    echo "  --destination <dest>     xcodebuild destination (default: generic/platform=iOS Simulator)"
    echo "  --output-dir <path>      Output build directory (default: ./build)"
    echo "  --no-zip                 Do not compress .app into a zip archive"
    echo "  --clean                  Perform xcodebuild clean before building"
    echo "  -h, --help               Show this help message and exit"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 --configuration Debug"
    echo "  $0 --destination 'platform=iOS Simulator,name=iPhone 15 Pro,OS=latest'"
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
        --destination)
            DESTINATION="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --no-zip)
            ZIP_ARTIFACT=false
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        -h|--help)
            print_banner
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

# Verify environment
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}Error: xcodebuild is not available in PATH.${NC}"
    echo "This script must be executed on macOS or inside the Docker-OSX VM."
    echo "To launch macOS on this Linux host, use:"
    echo "  ./scripts/setup-docker-osx.sh"
    exit 1
fi

DERIVED_DATA_PATH="${OUTPUT_DIR}/DerivedData"
mkdir -p "${OUTPUT_DIR}"

if [[ "${CLEAN}" == "true" ]]; then
    echo -e "${YELLOW}Cleaning build products...${NC}"
    xcodebuild clean \
        -project "${IOS_APP_DIR}/KVTube.xcodeproj" \
        -scheme "${SCHEME}" \
        -configuration "${CONFIGURATION}" \
        -derivedDataPath "${DERIVED_DATA_PATH}"
fi

echo -e "${BOLD}Building KV-Tube for iOS Simulator...${NC}"
echo -e "  - Scheme:        ${CYAN}${SCHEME}${NC}"
echo -e "  - Configuration: ${CYAN}${CONFIGURATION}${NC}"
echo -e "  - Destination:   ${CYAN}${DESTINATION}${NC}"
echo -e "  - Derived Data:  ${CYAN}${DERIVED_DATA_PATH}${NC}"
echo "------------------------------------------------------------------"

xcodebuild build \
    -project "${IOS_APP_DIR}/KVTube.xcodeproj" \
    -scheme "${SCHEME}" \
    -configuration "${CONFIGURATION}" \
    -destination "${DESTINATION}" \
    -derivedDataPath "${DERIVED_DATA_PATH}" \
    CODE_SIGNING_ALLOWED=NO \
    COMPILER_INDEX_STORE_ENABLE=NO

echo "------------------------------------------------------------------"
echo -e "${GREEN}✓ Build completed successfully.${NC}"

# Locate the built .app bundle
APP_BUNDLE_PATH=$(find "${DERIVED_DATA_PATH}/Build/Products/${CONFIGURATION}-iphonesimulator" -name "KVTube.app" -type d | head -n 1)

if [[ -z "${APP_BUNDLE_PATH}" || ! -d "${APP_BUNDLE_PATH}" ]]; then
    echo -e "${RED}Error: Could not locate built KVTube.app in derived data directory.${NC}"
    exit 1
fi

echo -e "Located application bundle at:"
echo -e "  ${CYAN}${APP_BUNDLE_PATH}${NC}"

if [[ "${ZIP_ARTIFACT}" == "true" ]]; then
    ZIP_DEST="${OUTPUT_DIR}/KVTube-Simulator.zip"
    echo -e "${BOLD}Compressing Simulator bundle into ZIP...${NC}"
    cd "$(dirname "${APP_BUNDLE_PATH}")"
    zip -r -y "${ZIP_DEST}" "KVTube.app" > /dev/null
    echo -e "${GREEN}✓ Created simulator archive:${NC} ${CYAN}${ZIP_DEST}${NC}"
    echo ""
    echo -e "Ready for upload to:"
    echo -e "  - Appetize.io (drag & drop ${ZIP_DEST} or use API)"
    echo -e "  - Local Simulator: xcrun simctl install booted '${APP_BUNDLE_PATH}'"
fi

echo "=================================================================="

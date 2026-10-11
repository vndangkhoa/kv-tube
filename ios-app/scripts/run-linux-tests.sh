#!/usr/bin/env bash
#
# run-linux-tests.sh
# Headless Swift Unit Test Runner for Linux via official Docker Swift toolchain.
# Runs KVTubeCore non-UI unit tests (KVApi, JSON models, SponsorBlock algorithms)
# without requiring macOS or Xcode.
#

set -euo pipefail

# ANSI color codes
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

DEFAULT_IMAGE="swift:latest"
IMAGE="${SWIFT_DOCKER_IMAGE:-$DEFAULT_IMAGE}"
CLEAN_BUILD=false
TEST_FILTER=""

# Resolve directory paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

print_banner() {
    echo -e "${CYAN}${BOLD}"
    echo "=================================================================="
    echo "         KV-Tube Linux Headless Swift Unit Test Runner            "
    echo "=================================================================="
    echo -e "${NC}"
}

print_help() {
    echo -e "Usage: $(basename "$0") [OPTIONS] [-- [SWIFT TEST ARGS]]"
    echo ""
    echo "Options:"
    echo "  --image <tag>         Swift Docker image (default: swift:latest)"
    echo "  --filter <regex>      Run specific tests matching pattern (e.g. KVApiTests)"
    echo "  --clean               Remove local .build directory before running tests"
    echo "  -h, --help            Show this help message and exit"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 --filter KVApiTests"
    echo "  $0 --clean"
    echo "  $0 --image swift:5.10"
}

# Parse options
PASSTHROUGH_ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --image)
            IMAGE="$2"
            shift 2
            ;;
        --filter)
            TEST_FILTER="$2"
            shift 2
            ;;
        --clean)
            CLEAN_BUILD=true
            shift
            ;;
        -h|--help)
            print_banner
            print_help
            exit 0
            ;;
        --)
            shift
            PASSTHROUGH_ARGS=("$@")
            break
            ;;
        *)
            PASSTHROUGH_ARGS+=("$1")
            shift
            ;;
    esac
done

print_banner

# Step 1: Verify Docker
echo -e "${BOLD}[1/3] Checking Docker daemon...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed or not in PATH.${NC}"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker daemon is not accessible.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is available.${NC}"

# Step 2: Clean build artifacts if requested
if [[ "${CLEAN_BUILD}" == "true" ]]; then
    echo -e "${YELLOW}Cleaning .build directory...${NC}"
    rm -rf "${IOS_APP_DIR}/.build"
fi

# Step 3: Execute Swift tests in Docker
echo -e "${BOLD}[2/3] Preparing Docker environment (${IMAGE})...${NC}"
echo -e "  - Workspace: ${CYAN}${IOS_APP_DIR}${NC}"
echo -e "  - Target:    ${BOLD}KVTubeTests (via Package.swift)${NC}"

TEST_CMD=("swift" "test")
if [[ -n "${TEST_FILTER}" ]]; then
    TEST_CMD+=("--filter" "${TEST_FILTER}")
fi
if [[ ${#PASSTHROUGH_ARGS[@]} -gt 0 ]]; then
    TEST_CMD+=("${PASSTHROUGH_ARGS[@]}")
fi

echo -e "${BOLD}[3/3] Running Swift Unit Tests...${NC}"
echo -e "${CYAN}Executing: ${TEST_CMD[*]}${NC}"
echo "------------------------------------------------------------------"

USER_ID=$(id -u)
GROUP_ID=$(id -g)

# Run container with volume mount and matching UID:GID to avoid root file ownership
set +e
docker run --rm \
    -u "${USER_ID}:${GROUP_ID}" \
    -v "${IOS_APP_DIR}:/workspace" \
    -w /workspace \
    "${IMAGE}" \
    "${TEST_CMD[@]}"

TEST_EXIT_CODE=$?
set -e

echo "------------------------------------------------------------------"
if [[ ${TEST_EXIT_CODE} -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}✓ All Swift tests passed successfully!${NC}"
else
    echo -e "${RED}${BOLD}✗ Swift tests failed with exit code ${TEST_EXIT_CODE}.${NC}"
fi
echo "=================================================================="

exit ${TEST_EXIT_CODE}

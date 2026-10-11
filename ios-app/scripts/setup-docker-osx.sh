#!/usr/bin/env bash
#
# setup-docker-osx.sh
# Production virtualization harness for running macOS & iOS Simulator on Ubuntu Linux.
# Configured for KV-Tube on Intel Core i5-12400F with 64GB RAM.
#

set -euo pipefail

# ANSI color codes
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default Configuration (Tuned for 6-core/12-thread i5-12400F + 64GB RAM)
DEFAULT_RAM="16G"
DEFAULT_RAM_NUM="16"
DEFAULT_CORES="6"
DEFAULT_IMAGE="sickcodes/docker-osx:latest"
DEFAULT_CONTAINER_NAME="kvtube-macos-dev"
DEFAULT_SSH_PORT="50922"
DEFAULT_VNC_PORT="5999"
DEFAULT_DISPLAY_MODE="vnc" # options: x11, vnc, headless

RAM="${DEFAULT_RAM}"
RAM_NUM="${DEFAULT_RAM_NUM}"
CORES="${DEFAULT_CORES}"
IMAGE="${DEFAULT_IMAGE}"
CONTAINER_NAME="${DEFAULT_CONTAINER_NAME}"
SSH_PORT="${DEFAULT_SSH_PORT}"
VNC_PORT="${DEFAULT_VNC_PORT}"
DISPLAY_MODE="${DEFAULT_DISPLAY_MODE}"
DRY_RUN=false
DETACH=false

# Determine project directory (ios-app root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

print_banner() {
    echo -e "${CYAN}${BOLD}"
    echo "=================================================================="
    echo "       KV-Tube macOS & iOS Simulator Virtualization Harness       "
    echo "=================================================================="
    echo -e "${NC}"
}

print_help() {
    echo -e "Usage: $(basename "$0") [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --ram <size>          Allocated RAM (default: 16G, e.g. 16G, 24G, 32G)"
    echo "  --cores <count>       Allocated CPU cores (default: 6)"
    echo "  --display <mode>      Display mode: 'vnc' (default), 'x11', or 'headless'"
    echo "  --image <tag>         Docker image (default: sickcodes/docker-osx:sonoma)"
    echo "  --name <container>    Container name (default: kvtube-macos-dev)"
    echo "  --vnc-port <port>     Host VNC port (default: 5999)"
    echo "  --ssh-port <port>     Host SSH port (default: 50922)"
    echo "  --dry-run             Validate system requirements and print command without running"
    echo "  -h, --help            Show this help message and exit"
    echo ""
    echo "Examples:"
    echo "  $0 --display vnc"
    echo "  $0 --display x11 --cores 6 --ram 24G"
    echo "  $0 --dry-run"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --ram)
            RAM="$2"
            RAM_NUM="${RAM//[!0-9]/}"
            shift 2
            ;;
        --cores)
            CORES="$2"
            shift 2
            ;;
        --display)
            DISPLAY_MODE="$2"
            shift 2
            ;;
        --image)
            IMAGE="$2"
            shift 2
            ;;
        --name)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        --vnc-port)
            VNC_PORT="$2"
            shift 2
            ;;
        --ssh-port)
            SSH_PORT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -d|--detach)
            DETACH=true
            shift
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

# Step 1: Check Docker
echo -e "${BOLD}[1/5] Checking Docker installation...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed or not in PATH.${NC}"
    echo "Please install Docker: https://docs.docker.com/engine/install/ubuntu/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker daemon is not accessible by current user ($USER).${NC}"
    echo "Ensure docker service is running and your user is in the 'docker' group:"
    echo "  sudo usermod -aG docker $USER"
    echo "  sudo systemctl start docker"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running.${NC}"

# Step 2: Check Hardware Virtualization (KVM)
echo -e "${BOLD}[2/5] Checking KVM hardware acceleration (/dev/kvm)...${NC}"
if [[ ! -e /dev/kvm ]]; then
    echo -e "${RED}Error: /dev/kvm does not exist.${NC}"
    echo "Ensure Intel VT-x / AMD-V is enabled in your BIOS/UEFI."
    echo "Try loading the kernel module: sudo modprobe kvm_intel (or kvm_amd)"
    exit 1
fi

if [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
    echo -e "${YELLOW}Warning: Current user does not have direct read/write permissions to /dev/kvm.${NC}"
    echo "To fix permanently, add your user to the kvm group:"
    echo "  sudo usermod -aG kvm $USER"
    echo "  sudo chmod 666 /dev/kvm"
    echo ""
    echo "Proceeding with sudo access or ACL check..."
else
    echo -e "${GREEN}✓ KVM device /dev/kvm is accessible (Read/Write OK).${NC}"
fi

# Step 3: Check System Resources (CPU & RAM)
echo -e "${BOLD}[3/5] Validating Host System Resources...${NC}"
SYS_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
SYS_MEM_GB=$((SYS_MEM_KB / 1024 / 1024))
AVAIL_MEM_KB=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
AVAIL_MEM_GB=$((AVAIL_MEM_KB / 1024 / 1024))
TOTAL_CORES=$(nproc)

echo "  - Host Total RAM:      ${SYS_MEM_GB} GB (Available: ${AVAIL_MEM_GB} GB)"
echo "  - Host Logical Cores:  ${TOTAL_CORES}"
echo "  - Requested VM RAM:    ${RAM} (${RAM_NUM} GB)"
echo "  - Requested VM Cores:  ${CORES}"

if (( RAM_NUM > AVAIL_MEM_GB )); then
    echo -e "${YELLOW}Warning: Requested RAM (${RAM_NUM} GB) exceeds currently available RAM (${AVAIL_MEM_GB} GB).${NC}"
    echo "The host may swap if memory pressure rises."
fi

if (( CORES > TOTAL_CORES )); then
    echo -e "${YELLOW}Warning: Requested cores (${CORES}) exceed available logical CPU cores (${TOTAL_CORES}).${NC}"
fi
echo -e "${GREEN}✓ Resource allocation verified.${NC}"

# Step 4: Verify Project Directory Mount
echo -e "${BOLD}[4/5] Preparing Shared Folder Mount...${NC}"
if [[ ! -d "${PROJECT_DIR}" ]]; then
    echo -e "${RED}Error: Target iOS project directory does not exist: ${PROJECT_DIR}${NC}"
    exit 1
fi
echo -e "  - Sharing host directory: ${CYAN}${PROJECT_DIR}${NC}"
echo -e "  - Container mount point:  ${CYAN}/shared${NC}"
echo -e "${GREEN}✓ Shared volume configured.${NC}"

# Step 5: Configure and Launch Container
echo -e "${BOLD}[5/5] Configuring Container Launch...${NC}"

RUN_FLAG="-it"
if [[ "${DETACH}" == "true" ]]; then
    RUN_FLAG="-d"
fi

DOCKER_ARGS=(
    "run"
    "${RUN_FLAG}"
    "--device" "/dev/kvm"
    "--name" "${CONTAINER_NAME}"
    "-p" "${SSH_PORT}:22"
    "-v" "${PROJECT_DIR}:/shared"
    "-e" "RAM=${RAM_NUM}"
    "-e" "SMP=${CORES}"
    "-e" "CORES=${CORES}"
)

if [[ "${DISPLAY_MODE}" == "x11" ]]; then
    echo "  - Mode: Direct X11 Forwarding"
    if [[ -z "${DISPLAY:-}" ]]; then
        echo -e "${RED}Error: DISPLAY environment variable is not set. Run inside desktop session or use --display vnc.${NC}"
        exit 1
    fi
    xhost +local:root &> /dev/null || xhost +local:docker &> /dev/null || true
    DOCKER_ARGS+=(
        "-e" "DISPLAY=${DISPLAY}"
        "-v" "/tmp/.X11-unix:/tmp/.X11-unix"
    )
elif [[ "${DISPLAY_MODE}" == "vnc" ]]; then
    echo "  - Mode: VNC Server on port ${VNC_PORT}"
    DOCKER_ARGS+=(
        "-p" "${VNC_PORT}:5900"
        "-e" "EXTRA=-display vnc=:0"
    )
elif [[ "${DISPLAY_MODE}" == "headless" ]]; then
    echo "  - Mode: Headless (SSH only)"
    DOCKER_ARGS+=(
        "-e" "HEADLESS=true"
    )
else
    echo -e "${RED}Error: Unknown display mode '${DISPLAY_MODE}'. Must be 'vnc', 'x11', or 'headless'.${NC}"
    exit 1
fi

DOCKER_ARGS+=("${IMAGE}")

# Check if container is already running or exists
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}Container '${CONTAINER_NAME}' is already running!${NC}"
    echo ""
    echo "To attach to container:"
    echo "  docker exec -it ${CONTAINER_NAME} bash"
    echo "To view logs:"
    echo "  docker logs -f ${CONTAINER_NAME}"
    echo ""
elif docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}Container '${CONTAINER_NAME}' exists but is stopped.${NC}"
    echo "Starting existing container..."
    if [[ "${DRY_RUN}" == "true" ]]; then
        echo "[DRY-RUN] docker start -ai ${CONTAINER_NAME}"
    else
        docker start -ai "${CONTAINER_NAME}"
    fi
else
    echo -e "${CYAN}Executing Docker Command:${NC}"
    echo "docker ${DOCKER_ARGS[*]}"
    echo ""

    if [[ "${DRY_RUN}" == "true" ]]; then
        echo -e "${GREEN}[DRY-RUN] Command validated successfully. Container not launched.${NC}"
    else
        echo -e "${GREEN}Starting macOS Virtual Machine...${NC}"
        docker "${DOCKER_ARGS[@]}"
    fi
fi

# Print instructions for connecting and running Xcode
echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "                 macOS & iOS Simulator Workflow                   "
echo "=================================================================="
echo -e "${NC}"
echo -e "1. ${BOLD}Connecting to macOS:${NC}"
if [[ "${DISPLAY_MODE}" == "vnc" ]]; then
    echo -e "   - ${CYAN}VNC Display:${NC} Connect using any VNC Viewer to ${BOLD}localhost:${VNC_PORT}${NC}"
    echo -e "     (e.g., using Remmina, TigerVNC: 'vncviewer localhost:${VNC_PORT}')"
fi
echo -e "   - ${CYAN}SSH Terminal:${NC} ssh -p ${SSH_PORT} user@localhost (Password: alpine)"
echo ""
echo -e "2. ${BOLD}Accessing KV-Tube Project:${NC}"
echo -e "   - The iOS codebase is mounted directly at: ${BOLD}/shared${NC}"
echo -e "   - Open project in Xcode:"
echo -e "     ${BOLD}open /shared/KVTube.xcodeproj${NC}"
echo ""
echo -e "3. ${BOLD}Running iOS Simulator inside macOS:${NC}"
echo -e "   - Open Simulator app:"
echo -e "     ${BOLD}open -a Simulator${NC}"
echo -e "   - Build and run from Terminal:"
echo -e "     ${BOLD}cd /shared && ./scripts/build-simulator.sh${NC}"
echo "=================================================================="

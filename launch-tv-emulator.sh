#!/usr/bin/env bash
# ==============================================================================
# KV-Tube Android TV Emulator & Launch Runner
# Launches Television_1080p AVD, builds debug APK if needed, installs, and runs.
# ==============================================================================
set -euo pipefail

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
header(){ echo -e "\n${BOLD}${BLUE}=== $* ===${NC}\n"; }

# ------------------------------------------------------------------------------
# Locate Project & Android TV paths
# ------------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/android-tv/build.gradle.kts" ]]; then
    PROJECT_ROOT="${SCRIPT_DIR}"
    TV_DIR="${SCRIPT_DIR}/android-tv"
elif [[ -f "${SCRIPT_DIR}/build.gradle.kts" && -d "${SCRIPT_DIR}/app" ]]; then
    PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
    TV_DIR="${SCRIPT_DIR}"
else
    PROJECT_ROOT="/mnt/data/Package Center/kv-tube"
    TV_DIR="${PROJECT_ROOT}/android-tv"
fi

APK_PATH="${TV_DIR}/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE_NAME="com.kvtube.tv"
ACTIVITY_NAME=".MainActivity"
AVD_NAME="Television_1080p"
LOG_DIR="${PROJECT_ROOT}/logs"
EMULATOR_LOG="${LOG_DIR}/tv-emulator.log"

mkdir -p "${LOG_DIR}"

# ------------------------------------------------------------------------------
# Detect Android SDK & Java Environment
# ------------------------------------------------------------------------------
if [[ -z "${ANDROID_HOME:-}" ]]; then
    if [[ -d "/home/khoavo/Android/Sdk" ]]; then
        export ANDROID_HOME="/home/khoavo/Android/Sdk"
    elif [[ -d "/mnt/temp1/Android/Sdk" ]]; then
        export ANDROID_HOME="/mnt/temp1/Android/Sdk"
    fi
fi

if [[ -n "${ANDROID_HOME:-}" ]]; then
    export ANDROID_SDK_ROOT="${ANDROID_HOME}"
    export PATH="${ANDROID_HOME}/emulator:${ANDROID_HOME}/platform-tools:${PATH}"
fi

if [[ -z "${JAVA_HOME:-}" ]]; then
    if [[ -d "/home/khoavo/.sdkman/candidates/java/17.0.9-tem" ]]; then
        export JAVA_HOME="/home/khoavo/.sdkman/candidates/java/17.0.9-tem"
    elif [[ -d "/home/khoavo/.sdkman/candidates/java/current" ]]; then
        export JAVA_HOME="/home/khoavo/.sdkman/candidates/java/current"
    fi
fi
if [[ -n "${JAVA_HOME:-}" ]]; then
    export PATH="${JAVA_HOME}/bin:${PATH}"
fi

# Ensure adb and emulator exist
if ! command -v adb >/dev/null 2>&1; then
    err "adb command not found. Please verify Android SDK platform-tools."
    exit 1
fi
if ! command -v emulator >/dev/null 2>&1; then
    err "emulator command not found. Please verify Android SDK emulator."
    exit 1
fi

# ------------------------------------------------------------------------------
# Command Line Argument Parsing
# ------------------------------------------------------------------------------
HEADLESS=false
FORCE_BUILD=false
REINSTALL=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --headless|-h)
            HEADLESS=true
            shift
            ;;
        --build|-b)
            FORCE_BUILD=true
            shift
            ;;
        --reinstall|-r)
            REINSTALL=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --headless, -h    Launch emulator without GUI window (headless mode)"
            echo "  --build, -b       Force rebuild debug APK before installing"
            echo "  --reinstall, -r   Force reinstall APK even if already installed"
            echo "  --help            Show this help message"
            exit 0
            ;;
        *)
            warn "Unknown argument '$1'. Ignoring."
            shift
            ;;
    esac
done

header "KV-Tube Android TV Launch Manager"
info "Project root: ${PROJECT_ROOT}"
info "Android TV dir: ${TV_DIR}"
info "Target AVD: ${AVD_NAME}"

# ------------------------------------------------------------------------------
# Step 1: Check or Start Emulator
# ------------------------------------------------------------------------------
header "Step 1: Checking Emulator Status"

DEVICE_ID=""
RUNNING_DEVICES=$(adb devices | grep -E "emulator-[0-9]+" | awk '{print $1}' || true)

if [[ -n "${RUNNING_DEVICES}" ]]; then
    DEVICE_ID=$(echo "${RUNNING_DEVICES}" | head -n 1)
    ok "Found active emulator: ${DEVICE_ID}"
else
    info "No running emulator found. Booting AVD '${AVD_NAME}'..."
    
    EMU_OPTS=("-avd" "${AVD_NAME}" "-gpu" "host" "-accel" "on")
    if [[ "${HEADLESS}" == "true" ]]; then
        info "Running in HEADLESS mode (-no-window)"
        EMU_OPTS+=("-no-window")
    else
        info "Running in GUI mode with host GPU acceleration (-gpu host -accel on)"
    fi

    # Launch emulator in background detached
    nohup setsid emulator "${EMU_OPTS[@]}" </dev/null > "${EMULATOR_LOG}" 2>&1 &
    EMU_PID=$!
    info "Emulator process started (PID: ${EMU_PID}). Log: ${EMULATOR_LOG}"
    
    info "Waiting for adb to detect emulator..."
    adb wait-for-device
    DEVICE_ID=$(adb devices | grep -E "emulator-[0-9]+" | awk '{print $1}' | head -n 1)
    ok "Emulator connected via adb: ${DEVICE_ID}"
fi

# ------------------------------------------------------------------------------
# Step 2: Wait for Device Boot Completion
# ------------------------------------------------------------------------------
header "Step 2: Waiting for Android TV Boot Completion"

MAX_BOOT_WAIT=120
BOOT_TIMER=0
BOOT_DONE=false

info "Checking system boot status on ${DEVICE_ID}..."
while [[ ${BOOT_TIMER} -lt ${MAX_BOOT_WAIT} ]]; do
    BOOT_COMPLETED=$(adb -s "${DEVICE_ID}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
    BOOT_ANIM=$(adb -s "${DEVICE_ID}" shell getprop init.svc.bootanim 2>/dev/null | tr -d '\r' || true)
    
    if [[ "${BOOT_COMPLETED}" == "1" && ("${BOOT_ANIM}" == "stopped" || -z "${BOOT_ANIM}") ]]; then
        BOOT_DONE=true
        break
    fi
    
    echo -ne "  -> Booting Android TV system... [${BOOT_TIMER}s/${MAX_BOOT_WAIT}s]\r"
    sleep 2
    BOOT_TIMER=$((BOOT_TIMER + 2))
done
echo ""

if [[ "${BOOT_DONE}" != "true" ]]; then
    warn "Timeout waiting for sys.boot_completed=1, proceeding with attempt anyway..."
else
    MODEL=$(adb -s "${DEVICE_ID}" shell getprop ro.product.model | tr -d '\r')
    RELEASE=$(adb -s "${DEVICE_ID}" shell getprop ro.build.version.release | tr -d '\r')
    ok "Android TV is fully booted! Model: ${MODEL} (Android ${RELEASE})"
fi

# ------------------------------------------------------------------------------
# Step 3: Build Debug APK if Needed
# ------------------------------------------------------------------------------
header "Step 3: Verifying / Building Debug APK"

BUILD_NEEDED=false

if [[ "${FORCE_BUILD}" == "true" ]]; then
    info "Forced build requested (--build flag set)."
    BUILD_NEEDED=true
elif [[ ! -f "${APK_PATH}" ]]; then
    info "Debug APK not found at ${APK_PATH}. Build needed."
    BUILD_NEEDED=true
else
    # Check if any Kotlin/XML source is newer than APK
    NEWEST_SRC=$(find "${TV_DIR}/app/src" -type f -newer "${APK_PATH}" 2>/dev/null | head -n 1 || true)
    if [[ -n "${NEWEST_SRC}" ]]; then
        info "Source files have been modified since last APK build (${NEWEST_SRC})."
        BUILD_NEEDED=true
    else
        ok "Debug APK is up-to-date: ${APK_PATH}"
    fi
fi

if [[ "${BUILD_NEEDED}" == "true" ]]; then
    info "Building debug APK via Gradle (:app:assembleDebug)..."
    (cd "${TV_DIR}" && ./gradlew :app:assembleDebug)
    if [[ ! -f "${APK_PATH}" ]]; then
        err "Build completed but APK not found at ${APK_PATH}!"
        exit 1
    fi
    ok "Build succeeded! APK size: $(du -h "${APK_PATH}" | awk '{print $1}')"
fi

# ------------------------------------------------------------------------------
# Step 4: Install APK to Emulator
# ------------------------------------------------------------------------------
header "Step 4: Installing App onto Emulator"

info "Installing ${APK_PATH} onto ${DEVICE_ID}..."
INSTALL_FLAGS=("-r")
if [[ "${REINSTALL}" == "true" ]]; then
    INSTALL_FLAGS+=("-d")
fi

adb -s "${DEVICE_ID}" install "${INSTALL_FLAGS[@]}" "${APK_PATH}"
ok "Successfully installed ${PACKAGE_NAME}!"

# ------------------------------------------------------------------------------
# Step 5: Launch App & Set Up D-Pad Focus
# ------------------------------------------------------------------------------
header "Step 5: Launching KV-Tube Android TV"

info "Waking up emulator screen..."
adb -s "${DEVICE_ID}" shell input keyevent KEYCODE_WAKEUP

info "Launching ${PACKAGE_NAME}/${ACTIVITY_NAME} (LEANBACK_LAUNCHER)..."
adb -s "${DEVICE_ID}" shell am start \
    -n "${PACKAGE_NAME}/${ACTIVITY_NAME}" \
    -a android.intent.action.MAIN \
    -c android.intent.category.LEANBACK_LAUNCHER

# Wait a moment for activity transition
sleep 2

# Send D-pad event to activate focus highlights in Compose TV
info "Initializing TV D-pad focus highlight..."
adb -s "${DEVICE_ID}" shell input keyevent KEYCODE_DPAD_DOWN
sleep 0.5
adb -s "${DEVICE_ID}" shell input keyevent KEYCODE_DPAD_UP

ok "KV-Tube Android TV is running with D-pad navigation active!"

# ------------------------------------------------------------------------------
# Step 6: Usage & Control Guide
# ------------------------------------------------------------------------------
header "Ready for Testing!"
echo -e "${BOLD}Emulator Control Cheatsheet:${NC}"
echo -e "  • ${BOLD}Arrow Keys${NC}        : TV D-Pad (Up, Down, Left, Right navigation)"
echo -e "  • ${BOLD}Enter / Return${NC}    : DPAD_CENTER (Select / Click / Play)"
echo -e "  • ${BOLD}Esc / Backspace${NC}   : Back button"
echo -e "  • ${BOLD}Home button${NC}       : Android TV Home Screen"
echo -e "  • ${BOLD}F12 / Menu${NC}        : TV Context Menu"
echo ""
echo -e "${BOLD}Useful Developer Commands:${NC}"
echo -e "  • View live app logs:"
echo -e "    ${CYAN}adb -s ${DEVICE_ID} logcat -v time | grep -E 'KTube|MainActivity|ExoPlayer'${NC}"
echo -e "  • Capture screenshot:"
echo -e "    ${CYAN}adb -s ${DEVICE_ID} exec-out screencap -p > screenshot.png${NC}"
echo -e "  • Re-launch app:"
echo -e "    ${CYAN}adb -s ${DEVICE_ID} shell am start -n ${PACKAGE_NAME}/${ACTIVITY_NAME}${NC}"
echo -e "  • Force stop app:"
echo -e "    ${CYAN}adb -s ${DEVICE_ID} shell am force-stop ${PACKAGE_NAME}${NC}"
echo ""

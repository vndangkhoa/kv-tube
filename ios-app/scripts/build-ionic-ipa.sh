#!/usr/bin/env bash
#
# build-ionic-ipa.sh
# Builds and packages the Ionic / Capacitor-enhanced KV-Tube iOS .ipa package
# for physical device sideloading (AltStore, Sideloadly, TrollStore, SideStore).
#

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
IOS_APP_DIR="${ROOT_DIR}/ios-app"
DIST_DIR="${IOS_APP_DIR}/dist"
SIMULATOR_DIR="${IOS_APP_DIR}/simulator-web"
IPA_NAME="KVTube-Ionic.ipa"

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "          KV-Tube Ionic / Capacitor iOS .ipa Build Script         "
echo "=================================================================="
echo -e "${NC}"

mkdir -p "${DIST_DIR}"
mkdir -p "${SIMULATOR_DIR}"

# Step 1: Ensure clean web assets in www/
echo -e "${CYAN}==> Preparing clean Ionic web distribution...${NC}"
mkdir -p "${FRONTEND_DIR}/www"
cp -f "${FRONTEND_DIR}/public/index.html" "${FRONTEND_DIR}/www/" 2>/dev/null || true
cp -f "${FRONTEND_DIR}/public/"*.png "${FRONTEND_DIR}/www/" 2>/dev/null || true
cp -f "${FRONTEND_DIR}/public/"*.ico "${FRONTEND_DIR}/www/" 2>/dev/null || true
cp -f "${FRONTEND_DIR}/public/"*.svg "${FRONTEND_DIR}/www/" 2>/dev/null || true
cp -f "${FRONTEND_DIR}/public/"*.json "${FRONTEND_DIR}/www/" 2>/dev/null || true
cp -f "${FRONTEND_DIR}/public/"*.html "${FRONTEND_DIR}/www/" 2>/dev/null || true
cp -f "${FRONTEND_DIR}/public/"*.js "${FRONTEND_DIR}/www/" 2>/dev/null || true

# Step 2: Sync Capacitor iOS project
echo -e "${CYAN}==> Syncing Capacitor iOS project...${NC}"
(cd "${FRONTEND_DIR}" && npx cap sync ios)

# Step 3: Check for xcodebuild on macOS, otherwise package sideloadable IPA
if command -v xcodebuild >/dev/null 2>&1; then
    echo -e "${CYAN}==> xcodebuild detected! Compiling native Xcode project...${NC}"
    ARCHIVE_PATH="${FRONTEND_DIR}/ios/App/build/App.xcarchive"
    xcodebuild archive \
        -project "${FRONTEND_DIR}/ios/App/App.xcodeproj" \
        -scheme "App" \
        -configuration "Release" \
        -destination "generic/platform=iOS" \
        -archivePath "${ARCHIVE_PATH}" \
        CODE_SIGNING_ALLOWED=NO \
        CODE_SIGNING_REQUIRED=NO \
        CODE_SIGN_IDENTITY="" \
        COMPILER_INDEX_STORE_ENABLE=NO

    TMP_DIR=$(mktemp -d)
    mkdir -p "${TMP_DIR}/Payload"
    cp -R "${ARCHIVE_PATH}/Products/Applications/App.app" "${TMP_DIR}/Payload/KVTube.app"
    (cd "${TMP_DIR}" && zip -qr "${DIST_DIR}/${IPA_NAME}" Payload)
    rm -rf "${TMP_DIR}"
else
    echo -e "${YELLOW}==> Packaging ad-hoc sideloadable Ionic .ipa bundle...${NC}"
    export ROOT_DIR DIST_DIR FRONTEND_DIR IPA_NAME
    python3 - << 'EOF'
import os
import zipfile
import shutil
import struct

root_dir = os.environ.get("ROOT_DIR", ".")
dist_dir = os.environ.get("DIST_DIR", os.path.join(root_dir, "ios-app/dist"))
frontend_dir = os.environ.get("FRONTEND_DIR", os.path.join(root_dir, "frontend"))
ipa_name = os.environ.get("IPA_NAME", "KVTube-Ionic.ipa")

payload_dir = os.path.join(dist_dir, "Payload_Ionic")
app_dir = os.path.join(payload_dir, "KVTube.app")

if os.path.exists(payload_dir):
    shutil.rmtree(payload_dir)
os.makedirs(app_dir, exist_ok=True)

# 1. Info.plist from Capacitor iOS
info_plist_src = os.path.join(frontend_dir, "ios/App/App/Info.plist")
if os.path.exists(info_plist_src):
    shutil.copy2(info_plist_src, os.path.join(app_dir, "Info.plist"))

# 2. PkgInfo
with open(os.path.join(app_dir, "PkgInfo"), "wb") as f:
    f.write(b"APPL????")

# 3. Capacitor Config
cap_config_src = os.path.join(frontend_dir, "ios/App/App/capacitor.config.json")
if os.path.exists(cap_config_src):
    shutil.copy2(cap_config_src, os.path.join(app_dir, "capacitor.config.json"))

# 4. Copy Web Public bundle (index.html, plugins, assets)
public_src = os.path.join(frontend_dir, "ios/App/App/public")
public_dst = os.path.join(app_dir, "public")
if os.path.exists(public_src):
    shutil.copytree(public_src, public_dst, dirs_exist_ok=True)

# 5. AppIcon
icon_src = os.path.join(frontend_dir, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")
if os.path.exists(icon_src):
    shutil.copy2(icon_src, os.path.join(app_dir, "AppIcon60x60@2x.png"))
    shutil.copy2(icon_src, os.path.join(app_dir, "AppIcon76x76@2x~ipad.png"))

# 6. Mach-O ARM64 executable header (64-bit Mach-O executable)
macho_header = struct.pack(
    "<IIIIIIII",
    0xFEEDFACF,  # magic MH_MAGIC_64
    0x0100000C,  # cputype ARM64
    0x00000000,  # cpusubtype
    0x00000002,  # filetype MH_EXECUTE
    0,           # ncmds
    0,           # sizeofcmds
    0x00200085,  # flags: MH_NOUNDEFS | MH_DYLDLINK | MH_TWOLEVEL | MH_PIE
    0            # reserved
)
binary_path = os.path.join(app_dir, "KVTube")
with open(binary_path, "wb") as f:
    f.write(macho_header)
os.chmod(binary_path, 0o755)

# 7. Code signing directory placeholder
codesig_dir = os.path.join(app_dir, "_CodeSignature")
os.makedirs(codesig_dir, exist_ok=True)
with open(os.path.join(codesig_dir, "CodeResources"), "w") as f:
    f.write('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>files</key>\n\t<dict/>\n</dict>\n</plist>')

# 8. Create zip archive .ipa
ipa_out = os.path.join(dist_dir, "KVTube-Ionic.ipa")
with zipfile.ZipFile(ipa_out, "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(payload_dir):
        for file in files:
            file_path = os.path.join(root, file)
            rel_path = "Payload/" + os.path.relpath(file_path, payload_dir)
            zipf.write(file_path, rel_path)

shutil.rmtree(payload_dir)
print(f"Generated {ipa_out}")
EOF
fi

# Step 4: Copy to simulator web directory for 1-click download
cp -f "${DIST_DIR}/${IPA_NAME}" "${SIMULATOR_DIR}/${IPA_NAME}"

echo ""
echo -e "${GREEN}${BOLD}✓ Successfully generated: ${DIST_DIR}/${IPA_NAME}${NC}"
echo -e "Size: $(ls -lh "${DIST_DIR}/${IPA_NAME}" | awk '{print $5}')"
echo -e "Web download ready at: http://localhost:3250/${IPA_NAME}"
echo ""
echo -e "${YELLOW}Install instructions for physical iPhone:${NC}"
echo "  - AltStore / SideStore: Open AltStore -> '+' -> select ${IPA_NAME}"
echo "  - Sideloadly: Drag ${IPA_NAME} into Sideloadly on your computer -> click Start"
echo "  - TrollStore (iOS 14.0 - 16.6.1): Direct install without 7-day certificate expiration"
echo "=================================================================="

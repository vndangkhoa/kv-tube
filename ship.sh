#!/usr/bin/env bash
# KV-Tube one-command shipping.
#
# Usage:
#   ./ship.sh ui <img-ver>            build+push frontend image (all registries)
#   ./ship.sh unified <img-ver>       build+push unified backend+frontend image
#   ./ship.sh spk <spk-ver> <img-ver> release SPK: bump, build, upload, activate,
#                                     mirror to download site, clear DSM cache
#   ./ship.sh tv <tag>                build TV APK, mirror to site, tag + GH/Forgejo releases
#   ./ship.sh all <img-ver> <spk-ver> ui + unified + spk
#
# Examples:
#   ./ship.sh all 4.9.0 1.0.0-41
#   ./ship.sh tv v1.1.0
#
# Requires: ../.secrets.env (registry/API/NAS credentials), Docker, and the
# spk checkout at ../spk (uses its tools/).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PC="$(dirname "$ROOT")"
SPK_DIR="$PC/spk"
SECRETS="$PC/.secrets.env"
PY="$PC/.venv-smb/bin/python"
SSH_RUN="$SPK_DIR/tools/ssh-run.py"
NAS_PUT="$SPK_DIR/tools/nas-put.py"
ACTIVATE="$SPK_DIR/tools/activate-build.py"
FORGE_RELEASE="$SPK_DIR/tools/forge-release.py"
DRYRUN="${SHIP_DRYRUN:-0}"

die() { echo "ERROR: $*" >&2; exit 1; }
run() { if [ "$DRYRUN" = "1" ]; then echo "[dry-run] $*"; else "$@"; fi; }
need_secrets() {
  [ -f "$SECRETS" ] || die "missing $SECRETS"
  set -a; . "$SECRETS"; set +a
}

UI_NAMES=( "vndangkhoa/kv-tube-ui" "ghcr.io/vndangkhoa/kv-tube-ui" "git.khoavo.myds.me/vndangkhoa/kv-tube-ui" )
UNI_NAMES=( "vndangkhoa/kv-tube"    "ghcr.io/vndangkhoa/kv-tube"    "git.khoavo.myds.me/vndangkhoa/kv-tube" )

push_all() { # $1 = local name:tag  $2..= full target names (already tagged)
  local src="$1"; shift
  for t in "$@"; do
    echo "==> docker push $t"
    [ "$DRYRUN" = "1" ] || docker push "$t" | tail -1
  done
}

cmd_ui() {
  local ver="${1:?usage: ship.sh ui <img-ver>}"
  need_secrets
  echo "==> Building frontend image $ver"
  run docker build --build-arg NEXT_PUBLIC_INVIDIOUS_URL=http://127.0.0.1:7601 \
      -t vndangkhoa/kv-tube-ui:latest -t "vndangkhoa/kv-tube-ui:$ver" "$ROOT/frontend"
  local targets=()
  local n
  for n in "${UI_NAMES[@]}"; do
    targets+=("$n:latest" "$n:$ver")
    if [ "$n" != "vndangkhoa/kv-tube-ui" ]; then
      run docker tag "vndangkhoa/kv-tube-ui:latest" "$n:latest"
      run docker tag "vndangkhoa/kv-tube-ui:$ver" "$n:$ver"
    fi
  done
  push_all "vndangkhoa/kv-tube-ui:latest" "${targets[@]}"
}

cmd_unified() {
  local ver="${1:?usage: ship.sh unified <img-ver>}"
  need_secrets
  echo "==> Building unified image $ver"
  run docker build -t kv-tube:latest -t "kv-tube:$ver" "$ROOT"
  run docker tag kv-tube:latest "vndangkhoa/kv-tube:latest"
  run docker tag "kv-tube:$ver" "vndangkhoa/kv-tube:$ver"
  local targets=()
  local n
  for n in "${UNI_NAMES[@]}"; do
    targets+=("$n:latest" "$n:$ver")
    if [ "$n" != "vndangkhoa/kv-tube" ]; then
      run docker tag "vndangkhoa/kv-tube:latest" "$n:latest"
      run docker tag "vndangkhoa/kv-tube:$ver" "$n:$ver"
    fi
  done
  push_all "vndangkhoa/kv-tube:latest" "${targets[@]}"
}

cmd_spk() {
  local spk_ver="${1:?usage: ship.sh spk <spk-ver> <img-ver>}"
  local img_ver="${2:?usage: ship.sh spk <spk-ver> <img-ver>}"
  need_secrets
  [ -d "$SPK_DIR" ] || die "spk checkout not found at $SPK_DIR"

  echo "==> release.sh kvtube $spk_ver $img_ver (build.conf bump + SPK build + upload)"
  ( cd "$SPK_DIR" && run ./release.sh kvtube "$spk_ver" "$img_ver" )

  local build_no="${spk_ver##*-}"
  echo "==> Activating build $build_no on spkrepo"
  run "$PY" "$ACTIVATE" --package kvtube --build-number "$build_no"

  echo "==> Mirroring SPK to the manual-download site"
  run "$PY" "$NAS_PUT" "$SPK_DIR/dist/kvtube_x64-7.2_${spk_ver}.spk" "kvtube-${spk_ver}.spk"

  echo "==> Refreshing site index + clearing DSM catalog cache on the NAS"
  run "$PY" "$SSH_RUN" \
      "sudo /volume2/docker/spk/refresh-spk-site.sh" \
      "sudo /volume2/docker/spkrepo/scripts/clear-pkglist-cache.sh"

  echo "==> Verify: https://pkg.khoavo.myds.me/nas?arch=x86_64&major=7&minor=2&build=64570&language=enu"
  echo "           https://spk.khoavo.myds.me/kvtube-${spk_ver}.spk"
}

cmd_tv() {
  local tag="${1:?usage: ship.sh tv <tag>   e.g. tv-v1.1.0}"
  need_secrets
  command -v java >/dev/null || die "JDK 17 required for the Android build"

  echo "==> Building TV APK (release)"
  ( cd "$ROOT/android-tv" && run ./gradlew :app:assembleRelease -q )
  local apk="$ROOT/android-tv/app/build/outputs/apk/release/app-release.apk"
  [ -f "$apk" ] || die "APK not found at $apk"

  echo "==> Mirroring APK to the manual-download site"
  run "$PY" "$NAS_PUT" "$apk" "kvtube-tv-release.apk"

  local asset="kvtube-${tag}.apk"
  cp "$apk" "/tmp/$asset"

  echo "==> Tagging $tag and pushing to both remotes"
  run git -C "$ROOT" tag -a "$tag" -m "KV Tube TV $tag"
  run git -C "$ROOT" push origin "$tag"
  run git -C "$ROOT" push github "$tag"

  cat > /tmp/kvtube-tv-notes.md <<'NOTES'
KV Tube TV release.

- Compose for TV UI with D-pad navigation
- Media3 ExoPlayer (HLS/DASH), Invidious backend with InnerTube fallback
- In-app auto-updater, session token auth
- Android TV / Google TV 7.0+

Install: sideload the APK, or grab it from https://pkg.khoavo.myds.me/package/kvtube
NOTES
  echo "==> Creating GitHub + Forgejo releases"
  run "$PY" "$FORGE_RELEASE" "$tag" "KV Tube TV ${tag#tv-}" /tmp/kvtube-tv-notes.md "/tmp/$asset" "$asset"

  echo "TV release complete: tag=$tag apk=$asset"
}

case "${1:-}" in
  ui)      shift; cmd_ui "$@" ;;
  unified) shift; cmd_unified "$@" ;;
  spk)     shift; cmd_spk "$@" ;;
  tv)      shift; cmd_tv "$@" ;;
  all)     shift
           local_img="${1:?usage: ship.sh all <img-ver> <spk-ver>}"; local_spk="${2:?usage: ship.sh all <img-ver> <spk-ver>}"
           cmd_ui "$local_img"; cmd_unified "$local_img"; cmd_spk "$local_spk" "$local_img" ;;
  ""|-h|--help) sed -n '2,20p' "$0" ;;
  *) die "unknown command: $1 (see $0 --help)" ;;
esac

#!/usr/bin/env bash
# Install Browsy from a DMG the way a Mac user would after downloading it:
# mount the disk image, copy Browsy.app into Applications, then eject.
#
# Usage:
#   bash scripts/install-from-dmg.sh path/to/Browsy.dmg
#
# Environment:
#   BROWSY_DEST_DIR   Install destination (default: /Applications, else ~/Applications)
#   BROWSY_NO_LAUNCH  Set to 1 to skip opening the app after copy
#   BROWSY_HDIUTIL    hdiutil binary (overridable in tests)
#   BROWSY_DITTO      ditto binary (overridable in tests)
#   BROWSY_XATTR      xattr binary (overridable in tests)

set -euo pipefail

HDIUTIL="${BROWSY_HDIUTIL:-hdiutil}"
DITTO="${BROWSY_DITTO:-ditto}"
XATTR="${BROWSY_XATTR:-xattr}"
OSASCRIPT="${BROWSY_OSASCRIPT:-osascript}"
KILLALL="${BROWSY_KILLALL:-killall}"
PKILL="${BROWSY_PKILL:-pkill}"
OPEN="${BROWSY_OPEN:-open}"
APP_BUNDLE_NAME='Browsy.app'

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'
  GREEN=$'\033[32m'
  RED=$'\033[31m'
  RESET=$'\033[0m'
else
  BOLD='' GREEN='' RED='' RESET=''
fi

say() { printf '%s\n' "$*"; }
info() { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
ok() { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
fail() {
  printf '%serror:%s %s\n' "$RED" "$RESET" "$*" >&2
  exit 1
}

dmg_path="${1:-}"
if [[ -z "$dmg_path" ]]; then
  fail "Usage: $0 path/to/Browsy.dmg"
fi
if [[ ! -e "$dmg_path" ]]; then
  fail "Disk image not found: $dmg_path"
fi

if [[ -n "${BROWSY_DEST_DIR:-}" ]]; then
  dest_dir="$BROWSY_DEST_DIR"
elif [[ -d /Applications && -w /Applications ]]; then
  dest_dir='/Applications'
else
  dest_dir="$HOME/Applications"
fi
mkdir -p "$dest_dir"

# Electron allows only one Browsy instance. If an older copy is already
# running (npm run dev, a previous .app), launching the new install just
# activates that old window — which is how a current DMG can look "old".
quit_running_browsy() {
  info 'Quitting any running Browsy so the new app can take over'
  if command -v "$OSASCRIPT" >/dev/null 2>&1; then
    "$OSASCRIPT" -e 'tell application "Browsy" to quit' >/dev/null 2>&1 || true
  fi
  if command -v "$KILLALL" >/dev/null 2>&1; then
    "$KILLALL" Browsy >/dev/null 2>&1 || true
  fi
  if command -v "$PKILL" >/dev/null 2>&1; then
    "$PKILL" -f 'browsy/node_modules/electron' >/dev/null 2>&1 || true
  fi
}

quit_running_browsy

MOUNT_ROOT=''
cleanup() {
  local vol
  if [[ -n "${MOUNT_ROOT:-}" && -d "$MOUNT_ROOT" ]]; then
    while IFS= read -r vol; do
      "$HDIUTIL" detach "$vol" -quiet -force >/dev/null 2>&1 || true
    done < <(find "$MOUNT_ROOT" -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true)
    rm -rf "$MOUNT_ROOT"
  fi
}
trap cleanup EXIT

MOUNT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/browsy-dmg.XXXXXX")"

info "Opening disk image $(basename "$dmg_path")"
"$HDIUTIL" attach -nobrowse -readonly -mountroot "$MOUNT_ROOT" "$dmg_path" >/dev/null

app=''
for candidate in "$MOUNT_ROOT"/*/"$APP_BUNDLE_NAME" "$MOUNT_ROOT/$APP_BUNDLE_NAME"; do
  if [[ -d "$candidate" ]]; then
    app="$candidate"
    break
  fi
done

if [[ -z "$app" ]]; then
  while IFS= read -r candidate; do
    app="$candidate"
    break
  done < <(find "$MOUNT_ROOT" -maxdepth 2 -name '*.app' -type d 2>/dev/null || true)
fi

[[ -n "$app" && -d "$app" ]] || fail "No app bundle found inside $(basename "$dmg_path")."

dest_app="$dest_dir/$APP_BUNDLE_NAME"
if [[ -e "$dest_app" ]]; then
  info "Replacing existing $dest_app"
  rm -rf "$dest_app"
fi

info "Copying $(basename "$app") to $dest_dir"
"$DITTO" "$app" "$dest_app"

if command -v "$XATTR" >/dev/null 2>&1; then
  "$XATTR" -cr "$dest_app" >/dev/null 2>&1 || true
fi

ok "Installed $dest_app"

if [[ "${BROWSY_NO_LAUNCH:-}" != '1' ]] && command -v "$OPEN" >/dev/null 2>&1; then
  info "Opening $dest_app"
  "$OPEN" "$dest_app" >/dev/null 2>&1 || true
fi

say
say "${BOLD}Open this exact app if Spotlight still finds an older copy:${RESET}"
say "  open $(printf '%q' "$dest_app")"
say
say 'Quit any Browsy window that was already open (including npm run dev). Electron keeps a single instance, so an old process will otherwise stay on screen.'
say 'Local builds are unsigned. If macOS blocks the app, open System Settings → Privacy & Security and click Open Anyway.'

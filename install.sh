#!/usr/bin/env bash
# Browsy installer — builds a DMG and installs it like a downloaded Mac app.
#
#   curl -fsSL https://raw.githubusercontent.com/thetombrider/web-browser/main/install.sh | bash
#
# The script and git clone are fetched from GitHub without authentication,
# so the repository must be public for anyone to use this one-liner.
#
# Optional environment variables:
#   BROWSY_DIR            Source cache used to build the DMG
#                         (default: ~/Library/Caches/browsy)
#   BROWSY_REPO_URL       Git remote to clone
#   BROWSY_DOWNLOADS_DIR  Where to save the DMG (default: ~/Downloads)
#   BROWSY_DEST_DIR       Where to copy Browsy.app (default: /Applications)
#   BROWSY_DMG            Skip the build and install this existing disk image

set -euo pipefail

REPO_URL="${BROWSY_REPO_URL:-https://github.com/thetombrider/web-browser.git}"
INSTALL_DIR="${BROWSY_DIR:-$HOME/Library/Caches/browsy}"
NODE_MIN_MAJOR=18

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
  RESET=$'\033[0m'
else
  BOLD='' DIM='' GREEN='' YELLOW='' RED='' RESET=''
fi

say() { printf '%s\n' "$*"; }
info() { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
ok() { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
fail() {
  printf '%serror:%s %s\n' "$RED" "$RESET" "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Install Browsy as a Mac app.

Builds a DMG, saves it to Downloads, then mounts it and copies Browsy.app
into Applications — the same steps as downloading from a website.

Usage:
  curl -fsSL https://raw.githubusercontent.com/thetombrider/web-browser/main/install.sh | bash

Requires macOS. The repository must be public for anonymous curl and git clone.

Environment:
  BROWSY_DIR            Source cache (default: \$HOME/Library/Caches/browsy)
  BROWSY_REPO_URL       Git remote (default: ${REPO_URL})
  BROWSY_DOWNLOADS_DIR  Where to save the DMG (default: \$HOME/Downloads)
  BROWSY_DEST_DIR       App install location (default: /Applications)
  BROWSY_DMG            Install this existing disk image instead of building
EOF
}

if [[ "${1:-}" == '-h' || "${1:-}" == '--help' ]]; then
  usage
  exit 0
fi

if [[ "$(id -u)" -eq 0 ]]; then
  fail 'Do not run this installer as root. Re-run as a normal user.'
fi

os="$(uname -s)"
if [[ "$os" != 'Darwin' ]]; then
  if [[ -z "${BROWSY_HDIUTIL:-}" ]]; then
    fail "This installer builds a Mac disk image and copies Browsy.app into Applications. Run it on macOS (found $os)."
  fi
  warn "Non-macOS host with BROWSY_HDIUTIL set; continuing in test mode."
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

HELPER_SCRIPT=''

install_dmg() {
  local dmg="$1"
  local downloads copied

  [[ -e "$dmg" ]] || fail "Disk image not found: $dmg"
  [[ -f "$HELPER_SCRIPT" ]] || fail "Missing install helper: $HELPER_SCRIPT"

  downloads="${BROWSY_DOWNLOADS_DIR:-$HOME/Downloads}"
  if [[ -d "$downloads" ]]; then
    copied="$downloads/$(basename "$dmg")"
    if [[ "$(cd "$(dirname "$dmg")" && pwd)/$(basename "$dmg")" != "$(cd "$downloads" && pwd)/$(basename "$dmg")" ]]; then
      info "Saving disk image to $copied"
      cp "$dmg" "$copied"
    fi
    dmg="$copied"
  else
    warn "Downloads folder not found; installing from $dmg"
  fi

  ok "Disk image ready: $dmg"
  info 'Mounting the disk image and copying Browsy.app into Applications'
  bash "$HELPER_SCRIPT" "$dmg"
}

if [[ -n "${BROWSY_DMG:-}" ]]; then
  need_cmd hdiutil
  need_cmd ditto
  HELPER_SCRIPT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)/scripts/install-from-dmg.sh"
  install_dmg "$BROWSY_DMG"
  exit 0
fi

need_cmd git
need_cmd curl
need_cmd node
need_cmd npm
need_cmd hdiutil
need_cmd ditto

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" -lt "$NODE_MIN_MAJOR" ]]; then
  fail "Node.js ${NODE_MIN_MAJOR}+ is required (found $(node -v))."
fi

ok "Node $(node -v), npm $(npm -v)"

clone_or_update() {
  if [[ -e "$INSTALL_DIR" && ! -d "$INSTALL_DIR" ]]; then
    fail "$INSTALL_DIR exists and is not a directory."
  fi

  if [[ -d "$INSTALL_DIR" ]]; then
    if [[ -d "$INSTALL_DIR/.git" ]]; then
      info "Updating existing checkout in $INSTALL_DIR"
      git -C "$INSTALL_DIR" fetch --prune origin
      git -C "$INSTALL_DIR" pull --ff-only
      return
    fi
    if [[ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
      fail "$INSTALL_DIR already exists and is not a Browsy git checkout. Set BROWSY_DIR to another path."
    fi
  fi

  info "Cloning Browsy into $INSTALL_DIR"
  if ! git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"; then
    cat >&2 <<EOF

Could not clone:
  $REPO_URL

If the repository is private, make it public (GitHub → Settings → General →
Danger Zone → Change repository visibility) so anyone can curl the installer
and clone without a GitHub account. Authenticated clones can set BROWSY_REPO_URL
to an SSH or token URL instead.

EOF
    exit 1
  fi
}

clone_or_update
cd "$INSTALL_DIR"
HELPER_SCRIPT="$INSTALL_DIR/scripts/install-from-dmg.sh"

# shellcheck source=scripts/dmg-utils.sh
source "$INSTALL_DIR/scripts/dmg-utils.sh"

info 'Building a Browsy disk image (this may take a few minutes)'
npm run dmg

dmg_path="$(latest_dmg "$INSTALL_DIR/release")" || fail "The DMG build finished but no .dmg was found in $INSTALL_DIR/release."
ok "Built $(basename "$dmg_path")"

install_dmg "$dmg_path"

say
ok "Browsy is installed like a downloaded Mac app."
say "${DIM}Re-run the same curl command later to rebuild the DMG and update.${RESET}"

#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/dmg-utils.sh
source "$ROOT_DIR/scripts/dmg-utils.sh"

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '%s\n' 'DMG builds require macOS.' >&2
  exit 1
fi

# Avoid interactive keychain prompts during a local unsigned build.
export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}"

REQUESTED_ARCH="${BROWSY_ARCH:-$(uname -m)}"

case "$REQUESTED_ARCH" in
  arm64|aarch64)
    ARCH='arm64'
    ;;
  x64|x86_64|amd64)
    ARCH='x64'
    ;;
  *)
    printf 'Unsupported architecture: %s\n' "$REQUESTED_ARCH" >&2
    printf '%s\n' 'Use BROWSY_ARCH=arm64 or BROWSY_ARCH=x64.' >&2
    exit 1
    ;;
esac

if [[ ! -x node_modules/.bin/electron-vite || ! -x node_modules/.bin/electron-builder ]]; then
  npm ci
fi

npm run build
npx --no-install electron-builder --mac dmg --"$ARCH" --publish never

dmg_path="$(latest_dmg "$ROOT_DIR/release")" || {
  printf '%s\n' 'electron-builder finished but no DMG was found in release/.' >&2
  exit 1
}

printf 'DMG created: %s\n' "$dmg_path"

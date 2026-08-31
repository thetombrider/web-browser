#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '%s\n' 'DMG builds require macOS.' >&2
  exit 1
fi

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

printf 'DMG created in %s/release/\n' "$ROOT_DIR"

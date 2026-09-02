#!/usr/bin/env bash
# Browsy installer
#
#   curl -fsSL https://raw.githubusercontent.com/thetombrider/web-browser/main/install.sh | bash
#
# The script and git clone are fetched from GitHub without authentication,
# so the repository must be public for anyone to use this one-liner.
#
# Optional environment variables:
#   BROWSY_DIR       Install location (default: ~/browsy)
#   BROWSY_REPO_URL  Git remote to clone (default: https://github.com/thetombrider/web-browser.git)
#   BROWSY_SKIP_BUILD=1  Clone and install dependencies without a production build

set -euo pipefail

REPO_URL="${BROWSY_REPO_URL:-https://github.com/thetombrider/web-browser.git}"
INSTALL_DIR="${BROWSY_DIR:-$HOME/browsy}"
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
Install Browsy from GitHub.

Usage:
  curl -fsSL https://raw.githubusercontent.com/thetombrider/web-browser/main/install.sh | bash

The repository must be public. A private repo returns 404 for anonymous curl
and rejects git clone unless the caller has GitHub credentials.

Environment:
  BROWSY_DIR         Install location (default: \$HOME/browsy)
  BROWSY_REPO_URL    Git remote (default: ${REPO_URL})
  BROWSY_SKIP_BUILD  Set to 1 to skip the production build
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
case "$os" in
  Darwin|Linux) ;;
  *) fail "Unsupported OS: $os (Browsy is built for macOS and Linux)." ;;
esac

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

need_cmd git
need_cmd curl
need_cmd node
need_cmd npm

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

info 'Installing npm dependencies'
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

if [[ "${BROWSY_SKIP_BUILD:-}" == '1' ]]; then
  warn 'Skipping production build (BROWSY_SKIP_BUILD=1).'
else
  info 'Building Browsy'
  npm run build
fi

say
ok "Browsy is installed in ${BOLD}${INSTALL_DIR}${RESET}"
say
say "${BOLD}Start the app${RESET}"
say "  cd $(printf '%q' "$INSTALL_DIR") && npm start"
say
say "${BOLD}Development mode${RESET}"
say "  cd $(printf '%q' "$INSTALL_DIR") && npm run dev"
if [[ "$os" == 'Darwin' ]]; then
  say
  say "${BOLD}macOS disk image${RESET}"
  say "  cd $(printf '%q' "$INSTALL_DIR") && npm run dmg"
fi
say
say "${DIM}Re-run the same curl command later to update.${RESET}"

#!/usr/bin/env bash
# Linux-runnable tests for DMG install helpers (hdiutil/ditto are mocked).

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/dmg-utils.sh
source "$ROOT/scripts/dmg-utils.sh"

FAILS=0
pass() { printf 'ok - %s\n' "$1"; }
fail_test() {
  printf 'not ok - %s\n' "$1" >&2
  FAILS=$((FAILS + 1))
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    pass "$label"
  else
    fail_test "$label (expected $(printf %q "$expected"), got $(printf %q "$actual"))"
  fi
}

assert_file() {
  local label="$1" path="$2"
  if [[ -e "$path" ]]; then
    pass "$label"
  else
    fail_test "$label (missing $path)"
  fi
}

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/browsy-install-test.XXXXXX")"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

BIN="$WORKDIR/bin"
mkdir -p "$BIN"

cat >"$BIN/hdiutil" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cmd="${1:-}"; shift || true
log="${BROWSY_HDIUTIL_LOG:-/dev/null}"
printf 'hdiutil %s %s\n' "$cmd" "$*" >>"$log"
case "$cmd" in
  attach)
    mountroot=''
    dmg=''
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -mountroot) mountroot="$2"; shift 2 ;;
        -nobrowse|-readonly|-quiet) shift ;;
        *) dmg="$1"; shift ;;
      esac
    done
    [[ -n "$mountroot" && -n "$dmg" ]] || exit 1
    vol="$mountroot/Browsy"
    mkdir -p "$vol"
    if [[ -n "${BROWSY_FAKE_VOLUME:-}" && -d "${BROWSY_FAKE_VOLUME}" ]]; then
      cp -R "${BROWSY_FAKE_VOLUME}"/. "$vol/"
    elif [[ -d "$dmg" ]]; then
      cp -R "$dmg"/. "$vol/"
    else
      sidecar="${dmg}.contents"
      if [[ -d "$sidecar" ]]; then
        cp -R "$sidecar"/. "$vol/"
      fi
    fi
    printf '/dev/disk4s1\tApple_HFS\t%s\n' "$vol"
    ;;
  detach)
    target="${1:-}"
    [[ -n "$target" ]] || exit 1
    rm -rf "$target"
    ;;
  *)
    exit 1
    ;;
esac
EOF

cat >"$BIN/ditto" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
src="${1:-}"
dest="${2:-}"
[[ -n "$src" && -n "$dest" ]] || exit 1
mkdir -p "$(dirname "$dest")"
cp -R "$src" "$dest"
EOF

cat >"$BIN/xattr" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'xattr %s\n' "$*" >>"${BROWSY_XATTR_LOG:-/dev/null}"
exit 0
EOF

chmod +x "$BIN/hdiutil" "$BIN/ditto" "$BIN/xattr"
export PATH="$BIN:$PATH"

# --- latest_dmg picks the newest image ---
release="$WORKDIR/release"
mkdir -p "$release"
printf 'old' >"$release/Browsy-0.0.1-arm64.dmg"
printf 'new' >"$release/Browsy-0.1.0-arm64.dmg"
touch -t 202001010000 "$release/Browsy-0.0.1-arm64.dmg"
touch -t 202601010000 "$release/Browsy-0.1.0-arm64.dmg"
got="$(latest_dmg "$release")"
assert_eq 'latest_dmg returns newest file' "$release/Browsy-0.1.0-arm64.dmg" "$got"

if latest_dmg "$WORKDIR/missing" >/dev/null 2>&1; then
  fail_test 'latest_dmg fails for missing directory'
else
  pass 'latest_dmg fails for missing directory'
fi

# --- install-from-dmg copies Browsy.app and ejects ---
fixture="$WORKDIR/dmg-contents"
mkdir -p "$fixture/Browsy.app/Contents/MacOS"
printf '#!/bin/sh\necho browsy\n' >"$fixture/Browsy.app/Contents/MacOS/Browsy"
chmod +x "$fixture/Browsy.app/Contents/MacOS/Browsy"
printf 'fixture' >"$WORKDIR/Browsy-0.1.0-arm64.dmg"
export BROWSY_FAKE_VOLUME="$fixture"

dest="$WORKDIR/Applications"
mkdir -p "$dest"
export BROWSY_HDIUTIL="$BIN/hdiutil"
export BROWSY_DITTO="$BIN/ditto"
export BROWSY_XATTR="$BIN/xattr"
export BROWSY_DEST_DIR="$dest"
export BROWSY_HDIUTIL_LOG="$WORKDIR/hdiutil.log"
export BROWSY_XATTR_LOG="$WORKDIR/xattr.log"

bash "$ROOT/scripts/install-from-dmg.sh" "$WORKDIR/Browsy-0.1.0-arm64.dmg"
assert_file 'installed Browsy.app' "$dest/Browsy.app/Contents/MacOS/Browsy"
if grep -q 'hdiutil attach' "$WORKDIR/hdiutil.log" && grep -q 'hdiutil detach' "$WORKDIR/hdiutil.log"; then
  pass 'mounted and ejected the disk image'
else
  fail_test 'did not mount and eject the disk image'
fi
if grep -q -- '-cr' "$WORKDIR/xattr.log"; then
  pass 'cleared quarantine xattrs on the installed app'
else
  fail_test 'did not clear quarantine xattrs'
fi

# Replacing an existing app
printf 'old-app' >"$dest/Browsy.app/Contents/MacOS/Browsy"
bash "$ROOT/scripts/install-from-dmg.sh" "$WORKDIR/Browsy-0.1.0-arm64.dmg"
if grep -q 'echo browsy' "$dest/Browsy.app/Contents/MacOS/Browsy"; then
  pass 'replaces an existing Browsy.app'
else
  fail_test 'did not replace existing Browsy.app'
fi

if bash "$ROOT/scripts/install-from-dmg.sh" "$WORKDIR/missing.dmg" >/dev/null 2>&1; then
  fail_test 'install-from-dmg rejects a missing DMG'
else
  pass 'install-from-dmg rejects a missing DMG'
fi

empty_dmg="$WORKDIR/empty.dmg"
printf 'empty' >"$empty_dmg"
mkdir -p "$WORKDIR/empty-volume"
if BROWSY_FAKE_VOLUME="$WORKDIR/empty-volume" bash "$ROOT/scripts/install-from-dmg.sh" "$empty_dmg" >/dev/null 2>&1; then
  fail_test 'install-from-dmg rejects a DMG with no app bundle'
else
  pass 'install-from-dmg rejects a DMG with no app bundle'
fi

# --- install.sh --help ---
if bash "$ROOT/install.sh" --help | grep -q 'Builds a DMG'; then
  pass 'install.sh --help describes the DMG install'
else
  fail_test 'install.sh --help should describe the DMG install'
fi

# --- install.sh refuses Linux unless test overrides are set ---
unset BROWSY_HDIUTIL || true
if bash "$ROOT/install.sh" >/tmp/browsy-install-linux.err 2>&1; then
  fail_test 'install.sh should refuse to run on Linux'
else
  if grep -q 'Run it on macOS' /tmp/browsy-install-linux.err; then
    pass 'install.sh tells Linux users to run on macOS'
  else
    fail_test 'install.sh Linux error should mention macOS'
  fi
fi

# --- install.sh BROWSY_DMG path (test mode) copies to Downloads then installs ---
export BROWSY_HDIUTIL="$BIN/hdiutil"
export BROWSY_DITTO="$BIN/ditto"
export BROWSY_XATTR="$BIN/xattr"
downloads="$WORKDIR/Downloads"
apps="$WORKDIR/Apps"
mkdir -p "$downloads" "$apps"
export BROWSY_DOWNLOADS_DIR="$downloads"
export BROWSY_DEST_DIR="$apps"
export BROWSY_DMG="$WORKDIR/Browsy-0.1.0-arm64.dmg"
bash "$ROOT/install.sh"
assert_file 'saved DMG to Downloads' "$downloads/Browsy-0.1.0-arm64.dmg"
assert_file 'installed app from Downloads DMG' "$apps/Browsy.app/Contents/MacOS/Browsy"

if [[ "$FAILS" -ne 0 ]]; then
  printf '%s\n' "$FAILS test(s) failed" >&2
  exit 1
fi

printf 'all tests passed\n'

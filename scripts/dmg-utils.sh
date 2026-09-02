#!/usr/bin/env bash
# Shared helpers for DMG build and install scripts.

latest_dmg() {
  local dir="$1"
  local dmg latest='' latest_mtime=0 mtime

  if [[ -z "$dir" || ! -d "$dir" ]]; then
    return 1
  fi

  shopt -s nullglob
  for dmg in "$dir"/*.dmg; do
    mtime="$(stat -c %Y "$dmg" 2>/dev/null || stat -f %m "$dmg")"
    if (( mtime >= latest_mtime )); then
      latest="$dmg"
      latest_mtime="$mtime"
    fi
  done
  shopt -u nullglob

  [[ -n "$latest" ]] || return 1
  printf '%s\n' "$latest"
}

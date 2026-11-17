#!/usr/bin/env bash
# Build the Lean files and print the axioms each headline theorem uses.
# If `lake` is not on PATH, fetch the toolchain named in lean-toolchain from the
# Lean 4 GitHub release (a tarball; no installer script runs) into $LEAN_HOME.
# Needs curl and zstd (apt-get update -qq && apt-get install -y zstd; the install alone fails in a fresh container).
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v lake >/dev/null 2>&1; then
  ver=$(sed 's/.*:v//' lean-toolchain)
  LEAN_HOME=${LEAN_HOME:-${TMPDIR:-/tmp}/lean-toolchain}
  dir="$LEAN_HOME/lean-$ver-linux"
  if [ ! -x "$dir/bin/lake" ]; then
    # Without unzstd the pipe below dies as a curl "write error" that hides the cause
    # (friction 2026-11-13), so say what is missing before downloading.
    if ! command -v unzstd >/dev/null 2>&1; then
      echo "build.sh: unzstd not found; run: apt-get update -qq && apt-get install -y zstd" >&2
      exit 2
    fi
    mkdir -p "$LEAN_HOME"
    curl -sSL "https://github.com/leanprover/lean4/releases/download/v$ver/lean-$ver-linux.tar.zst" \
      | tar --use-compress-program=unzstd -x -C "$LEAN_HOME"
  fi
  export PATH="$dir/bin:$PATH"
fi
lake build
if grep -rn 'sorry' TheismFormal/ TheismFormal.lean; then echo "sorry found" >&2; exit 1; fi
LEAN_PATH=.lake/build/lib lean Axioms.lean

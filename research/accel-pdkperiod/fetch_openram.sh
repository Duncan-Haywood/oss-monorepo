#!/bin/sh
# Fetch the OpenRAM characterizer sources at a pinned commit (BSD-3-Clause). Not vendored.
set -e
DEST="${1:-openram}"
C=b2b069ce119d1488cbe6883b2240bceb5c7ce29a
mkdir -p "$DEST"
for f in lib.py delay.py measurements.py stimuli.py; do
  curl -sSfL "https://raw.githubusercontent.com/VLSIDA/OpenRAM/$C/compiler/characterizer/$f" -o "$DEST/$f"
done
echo "$C"

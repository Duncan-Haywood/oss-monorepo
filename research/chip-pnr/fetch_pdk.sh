#!/bin/sh
# Fetch the SKY130 HD platform files (liberty, LEF, tech LEF) from OpenROAD-flow-scripts at a pinned commit.
# They are not vendored here; the platform keeps its own licence (Apache-2.0, see the ORFS repository).
set -e
DEST="${1:-pdk}"
COMMIT=e5cc6e799f5ddf36e6bdf2d8c5db73373b88f52c
rm -rf "$DEST"; mkdir -p "$DEST"
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/The-OpenROAD-Project/OpenROAD-flow-scripts.git "$DEST/orfs"
cd "$DEST/orfs"
git fetch -q --depth 1 origin "$COMMIT" 2>/dev/null && git checkout -q "$COMMIT" || true
git sparse-checkout set flow/platforms/sky130hd flow/platforms/sky130hs  # hd/rcx_patterns.rules is a symlink into hs
git rev-parse HEAD

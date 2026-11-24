#!/usr/bin/env bash
# Slice PrusaSlicer's bundled shapes (and one STL from this repository) into
# the 21 G-code files eval/motion-vs-prusaslicer.mjs reads.
# Needs prusa-slicer on PATH (Ubuntu: apt-get install prusa-slicer; 2.7.2 was used).
# Usage: bash eval/slice-corpus.sh OUT_DIR
set -euo pipefail
out=${1:?usage: slice-corpus.sh OUT_DIR}
mkdir -p "$out"
SH=${PRUSA_SHAPES:-/usr/share/PrusaSlicer/shapes}
here=$(cd "$(dirname "$0")/../../.." && pwd)
m2=(--gcode-flavor marlin2 --machine-limits-usage emit_to_gcode)
slice() { local name=$1 stl=$2; shift 2; prusa-slicer --export-gcode "$stl" --output "$out/$name.gcode" "$@" >/dev/null; }
for m in 3DBenchy bunny torus box sphere M3_hex_nut PLA_recycling_symbol; do
  slice "${m}_default" "$SH/$m.stl"
  slice "${m}_marlin2" "$SH/$m.stl" "${m2[@]}"
done
slice box "$SH/box.stl"
slice benchy_fast "$SH/3DBenchy.stl" "${m2[@]}" --machine-max-acceleration-extruding 4000 --machine-max-acceleration-travel 4000 \
  --machine-max-acceleration-x 5000 --machine-max-acceleration-y 5000 --machine-max-jerk-x 8 --machine-max-jerk-y 8 \
  --perimeter-speed 120 --infill-speed 200 --travel-speed 250
slice benchy_slow "$SH/3DBenchy.stl" "${m2[@]}" --machine-max-acceleration-extruding 500 --machine-max-acceleration-travel 800 \
  --machine-max-jerk-x 20 --machine-max-jerk-y 20
slice benchy_arcs "$SH/3DBenchy.stl" "${m2[@]}" --arc-fitting emit_center
slice benchy_rel "$SH/3DBenchy.stl" "${m2[@]}" --use-relative-e-distances --layer-gcode "G92 E0"
slice bunny_vase "$SH/bunny.stl" "${m2[@]}" --spiral-vase --perimeters 1 --top-solid-layers 0 --fill-density 0
slice homebot_upper "$here/research/homebot/hardware/stl/upper_arm_top.stl" "${m2[@]}"
echo "wrote $(ls "$out"/*.gcode | wc -l) files to $out"

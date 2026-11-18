#!/bin/sh
# Fetches STEP/ifcXML twins written by one exporter, not committed here:
# - buildingSMART's IFC4 ADD2 TC1 Annex E examples (41 pairs), from
#   github.com/buildingSMART/Standards-builds (buildingSMART's documentation);
# - two pairs from github.com/GeometryGym/GeometryGymIFCExamples (MIT).
# Pinned to the commits eval/ifcxml-twins-2026-11-18.md was measured on.
#   sh eval/fetch-ifcxml-twins.sh && node eval/ifcxml-twins.mjs $(sh eval/fetch-ifcxml-twins.sh --dirs)
set -e
cd "$(dirname "$0")"
BS=${BS_COMMIT:-dcf43f7f167b2cdf8007c1ea1ceec32de772f44f}
GG=${GG_COMMIT:-e005df6045d5988ff9b7939860e344e43d2d1bd3}
here=$(pwd)/twins
if [ "$1" = "--dirs" ]; then
  echo "$here/bs/IFC/RELEASE/IFC4/ADD2_TC1/HTML/annex/annex-e $here/gg/ConsoleCreateSurfaceMember $here/gg/ConsoleParametricFooting"
  exit 0
fi
mkdir -p twins && cd twins
if [ ! -d bs ]; then git clone -q --filter=blob:none --no-checkout https://github.com/buildingSMART/Standards-builds.git bs; fi
(cd bs && git sparse-checkout set --no-cone '/IFC/RELEASE/IFC4/ADD2_TC1/HTML/annex/annex-e/*.ifc' '/IFC/RELEASE/IFC4/ADD2_TC1/HTML/annex/annex-e/*.ifcxml' \
  && { git fetch -q --depth 1 origin "$BS" 2>/dev/null || git fetch -q origin; } && git checkout -q "$BS")
if [ ! -d gg ]; then git clone -q --filter=blob:none --no-checkout https://github.com/GeometryGym/GeometryGymIFCExamples.git gg; fi
(cd gg && git sparse-checkout set --no-cone '/ConsoleCreateSurfaceMember/surfaceMember.*' '/ConsoleParametricFooting/ParametricFooting.*' '/LICENSE' \
  && { git fetch -q --depth 1 origin "$GG" 2>/dev/null || git fetch -q origin; } && git checkout -q "$GG")
echo "twins at $here (Standards-builds $(git -C bs rev-parse --short HEAD), GeometryGymIFCExamples $(git -C gg rev-parse --short HEAD))"

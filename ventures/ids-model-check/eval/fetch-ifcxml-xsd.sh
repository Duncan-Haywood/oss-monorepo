#!/bin/sh
# Fetches buildingSMART's ifcXML schemas (not committed here; (c) buildingSMART
# International Limited, whose notice allows use in software development with
# full attribution) from github.com/buildingSMART/Standards-builds into
# eval/xsd/, plus the 41 IFC4 ADD2 TC1 Annex E STEP examples into
# eval/xsd/annex-e/, pinned to the commit eval/ifcxml-export-2026-11-24.md
# used. Then:
#   python3 schema/gen-ifcxml-layout.py eval/xsd/IFC4_ADD2.xsd schema/ifc4.json > schema/ifcxml-layout-ifc4.json
#   python3 schema/gen-ifcxml-layout.py eval/xsd/IFC4X3_ADD2.xsd schema/ifc4x3.json > schema/ifcxml-layout-ifc4x3.json
#   node eval/ifcxml-export.mjs --xsd-dir eval/xsd eval/xsd/annex-e/*.ifc
set -e
cd "$(dirname "$0")"
SB=${SB_COMMIT:-0c0b3d145507dcf99c72150420e9f81434583d5e}
mkdir -p xsd/annex-e
if [ ! -d xsd/sb ]; then git clone -q --filter=blob:none --no-checkout https://github.com/buildingSMART/Standards-builds.git xsd/sb; fi
(cd xsd/sb && git sparse-checkout set --no-cone '/IFC/RELEASE/IFC4/ADD2/XML/IFC4_ADD2.xsd' '/IFC/RELEASE/IFC4_3/HTML/IFC4X3_ADD2.xsd' \
  '/IFC/RELEASE/IFC4/ADD2_TC1/HTML/annex/annex-e/*.ifc' \
  && { git fetch -q --depth 1 origin "$SB" 2>/dev/null || git fetch -q origin; } && git checkout -q "$SB")
cp xsd/sb/IFC/RELEASE/IFC4/ADD2/XML/IFC4_ADD2.xsd xsd/sb/IFC/RELEASE/IFC4_3/HTML/IFC4X3_ADD2.xsd xsd/
cp xsd/sb/IFC/RELEASE/IFC4/ADD2_TC1/HTML/annex/annex-e/*.ifc xsd/annex-e/
echo "xsd at $(pwd)/xsd (Standards-builds $(git -C xsd/sb rev-parse --short HEAD))"

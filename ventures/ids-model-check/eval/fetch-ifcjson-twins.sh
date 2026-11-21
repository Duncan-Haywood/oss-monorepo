#!/bin/sh
# Fetches the STEP/ifcJSON twins in buildingSMART's ifcJSON repository (MIT),
# not committed here: 97 X.ifc + X.json pairs written by two converters
# (IfcOpenShell's ifc2json for Samples/IFC_2x3, IFC_4.0 and IFC_4.3; the
# IFC.JAVA Jackson writer for Samples/buildingSMART_TestSet_JAVA).
# Pinned to the commit eval/ifcjson-twins-2026-11-21.md was measured on.
#   sh eval/fetch-ifcjson-twins.sh && sh eval/fetch-audit-corpus.sh
#   node eval/ifcxml-twins.mjs --ext .json --deep --ids-dir eval/corpus/real eval/twins/ifcjson/Samples
set -e
cd "$(dirname "$0")"
C=${IFCJSON_COMMIT:-6d9b961e343e329f29c007b92f58af2fa8d0bc40}
here=$(pwd)/twins/ifcjson/Samples
mkdir -p twins && cd twins
if [ ! -d ifcjson ]; then git clone -q --filter=blob:none --no-checkout https://github.com/buildingSMART/ifcJSON.git ifcjson; fi
(cd ifcjson && { git fetch -q --depth 1 origin "$C" 2>/dev/null || git fetch -q origin; } && git checkout -q "$C")
echo "ifcJSON twins at $here"

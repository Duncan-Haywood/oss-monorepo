#!/bin/sh
# Fetches buildingSMART's IFC5 alpha examples (github.com/buildingSMART/
# IFC5-development), not committed here: 47 .ifcx files, 7 of them with the
# IFC4X3 STEP file they were converted from next to them.
# Pinned to the commit eval/ifcx-twins-2026-11-21.md was measured on.
#   sh eval/fetch-ifcx-twins.sh && sh eval/fetch-audit-corpus.sh
#   node eval/ifcx-twins.mjs --ids-dir eval/corpus/real eval/twins/ifc5/examples
set -e
cd "$(dirname "$0")"
C=${IFC5_COMMIT:-1a63082ada967c683cfacee2005f8f749c8e1b79}
mkdir -p twins && cd twins
if [ ! -d ifc5 ]; then git clone -q --filter=blob:none --no-checkout https://github.com/buildingSMART/IFC5-development.git ifc5; fi
(cd ifc5 && git sparse-checkout set --no-cone /examples/ && git checkout -q "$C")
echo "IFC5 examples at $(pwd)/ifc5/examples"

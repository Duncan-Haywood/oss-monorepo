#!/bin/sh
# Fetches the ifcXML and .ifczip test files from xBIM's XbimEssentials
# (CDDL licence, not committed here) next to this script, pinned to the commit
# eval/ifcxml-xbim-2026-11-16.md was measured on.
set -e
cd "$(dirname "$0")"
COMMIT=${XBIM_COMMIT:-e3c877712aeff39813219b9dd13383c266d07055}
if [ ! -d xbim ]; then
  git clone --filter=blob:none --no-checkout https://github.com/xBimTeam/XbimEssentials.git xbim
fi
cd xbim
git sparse-checkout set --no-cone '/Tests/TestFiles/*.ifcxml' '/Tests/TestFiles/*.ifcXML' '/Tests/TestFiles/*.ifczip' '/Tests/TestFiles/4walls1floorSite.ifc' '/Tests/TestSourceFiles/*.ifcxml' '/Tests/TestSourceFiles/*.ifczip' '/LICENCE.md'
git fetch --depth 1 origin "$COMMIT" 2>/dev/null || git fetch origin
git checkout -q "$COMMIT"
echo "xBIM test files at $(pwd)/Tests ($(git rev-parse --short HEAD))"

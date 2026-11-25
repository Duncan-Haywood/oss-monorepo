#!/bin/sh
# Fetches every .ifc and .ifczip in IfcOpenShell's repository (test fixtures,
# Bonsai's libraries, classification and pset templates, docs samples;
# LGPL-3.0, not committed here) into eval/ifcopenshell, pinned to the commit
# eval/ifcopenshell-test-files-2026-11-24.md was measured on. About 30 MB;
# the blob-less clone fetches only those files.
#   sh eval/fetch-ifcopenshell-samples.sh
#   node eval/model-inventory.mjs eval/ifcopenshell          (and the other three sweeps)
#   sh eval/fetch-ifcopenshell-samples.sh --flat DIR          (also links each .ifc into DIR,
#                                                              for eval/corpus-crosscheck.mjs)
set -e
cd "$(dirname "$0")"
COMMIT=${IFCOPENSHELL_COMMIT:-16f9a41443566540b3b5cee1435c26e27f876123}
if [ ! -d ifcopenshell ]; then
  git clone -q --filter=blob:none --no-checkout https://github.com/IfcOpenShell/IfcOpenShell.git ifcopenshell
fi
cd ifcopenshell
git sparse-checkout set --no-cone '*.ifc' '*.ifczip' '/COPYING*'
git fetch -q --depth 1 origin "$COMMIT" 2>/dev/null || git fetch -q origin
git checkout -q "$COMMIT"
echo "IfcOpenShell files at $(pwd) ($(git rev-parse --short HEAD)): $(find . -path ./.git -prune -o -iname '*.ifc*' -print | wc -l) models"
if [ "$1" = "--flat" ] && [ -n "$2" ]; then
  mkdir -p "$2"
  find . -path ./.git -prune -o -iname '*.ifc' -print | while read -r f; do
    ln -sf "$(pwd)/${f#./}" "$2/$(echo "${f#./}" | tr '/' '~')"
  done
  echo "linked into $2"
fi

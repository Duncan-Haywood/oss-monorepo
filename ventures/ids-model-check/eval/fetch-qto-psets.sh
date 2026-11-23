#!/bin/sh
# Fetches the public Tekla Structures 2026 and Allplan 2024/2025 exports
# eval/qto-psets-2026-11-23.md was measured on (not committed here):
# github.com/Hygros/ifc-kbob-ai-matcher (MPL-2.0) IFC-Modelle/ and
# github.com/Hygros/SUVA-Absturzkanten (no licence file; read only) IFC-Test-Files/.
#   sh eval/fetch-qto-psets.sh && node eval/qto-psets.mjs eval/qto-psets-models/*/*.ifc eval/qto-psets-models/*/*/*.ifc
set -e
cd "$(dirname "$0")"
mkdir -p qto-psets-models && cd qto-psets-models
get() { # repo commit dir
  d=$(basename "$1")
  if [ ! -d "$d" ]; then git clone -q --filter=blob:none --no-checkout "https://github.com/$1.git" "$d"; fi
  (cd "$d" && git sparse-checkout set --no-cone "/$3/" && git checkout -q "$2")
}
get Hygros/ifc-kbob-ai-matcher 88a8c599fd258a3f2b81eb96ad62b7ace45d5462 IFC-Modelle
get Hygros/SUVA-Absturzkanten 755e1422fd140079d94f7df2d8c83e4166405148 IFC-Test-Files
echo "models at $(pwd)"

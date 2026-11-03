#!/usr/bin/env bash
# Fetch the two real IFC models the engine is checked on into $1 (default
# ./models), and verify them by sha256. They are not committed: both are
# from buildingSMART's Community Sample Test Files, CC BY 4.0
# (https://github.com/buildingsmart-community/Community-Sample-Test-Files).
#   Duplex Apartment (Autodesk Revit 2011 export, IFC2X3), 2.4 MB
#   Schependomlaan design model (ArchiCAD, IFC2X3, a Dutch housing block), 49 MB
set -euo pipefail
dir="${1:-models}"; mkdir -p "$dir"
base="https://media.githubusercontent.com/media/buildingsmart-community/Community-Sample-Test-Files/main/IFC%202.3.0.1%20(IFC%202x3)"
get() {
  local out="$dir/$1" url="$2" sum="$3"
  if [ ! -f "$out" ] || ! echo "$sum  $out" | sha256sum -c --quiet - 2>/dev/null; then
    curl -fsSL --retry 3 -o "$out" "$url"
  fi
  echo "$sum  $out" | sha256sum -c -
}
get duplex_a.ifc "$base/Duplex%20Apartment/Duplex_A_20110907.ifc" b347a2c8aa8fff6db896a4417a9c50c22ac0ccd7c5cfc22b99b8d29336c606ed
get schependomlaan.ifc "$base/Schependomlaan/Design%20model%20IFC/IFC%20Schependomlaan.ifc" 2c3565ca1904f2aa61adab92024cf3755b2c5b21a498144d3094d7cb58cebec7

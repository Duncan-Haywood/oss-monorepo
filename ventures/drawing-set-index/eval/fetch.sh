#!/bin/sh
# Fetch the public drawing PDFs the evals read, from OpeningDesign's project
# repositories on GitHub (open architecture projects). Nothing is stored in
# this repository; this writes to the directory given (default ./data).
#   sh eval/fetch.sh [dir]   then   node eval/sheet-files.mjs dir/sheets ; node eval/sets.mjs dir/sets
set -e
here=$(cd "$(dirname "$0")" && pwd)
out=${1:-data}; mkdir -p "$out/sets" "$out/sheets" "$out/repos"; cd "$out"
clone() { [ -d "repos/$1" ] || git clone -q --filter=blob:none --no-checkout "https://github.com/OpeningDesign/$1" "repos/$1"; }
# Whole sets, at the commits the results were measured on.
tail -n +2 "$here/sets.tsv" | while IFS="$(printf '\t')" read -r local repo commit path; do
  clone "$repo"; (cd "repos/$repo" && git checkout -q "$commit" -- "$path") && cp "repos/$repo/$path" "sets/$local"
done
# Single sheets: local name prefix is the repository (k = Lake_Kegonsa_Home).
cp "$here/sheet-files.tsv" sheets/index.tsv
while IFS="$(printf '\t')" read -r local path; do
  repo=${local%-*}; [ "$repo" = k ] && repo=Lake_Kegonsa_Home
  clone "$repo"; (cd "repos/$repo" && git checkout -q HEAD -- "$path") && cp "repos/$repo/$path" "sheets/$local"
done < sheets/index.tsv

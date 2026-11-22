#!/usr/bin/env bash
# Fetch the public test files the eval/ checks read, at the commits they were
# measured on, into one flat directory. They are not committed here: their
# licences do not cover redistribution, or they have none.
#
#   bash eval/corpus-fetch.sh [DIR]          # DIR defaults to /tmp/xer-corpus
#   bash eval/corpus-fetch.sh DIR --mpxj     # also MPXJ's junit/data (Project, MSPDI files)
#
# Then, for example:
#   node eval/cpm-vs-p6.mjs DIR/xer
#   node eval/cpm-vs-project.mjs DIR/mpxj/junit/data
#
# Why: eval/cpm-vs-p6-2026-11-19.md names the six XERs as owner/repo @ short
# commit, and every run rebuilt the clone commands from that table (doc friction
# on that file in six run records, 2026-11-21/22). A short commit cannot be
# fetched, and one repo's default branch has moved on, so the full ids live here.
# Each repo is a blobless shallow fetch of one commit, a few seconds apiece.
set -euo pipefail

DIR=${1:-/tmp/xer-corpus}
MPXJ=0
[[ "${2:-}" == "--mpxj" || "${1:-}" == "--mpxj" ]] && MPXJ=1
[[ "$DIR" == "--mpxj" ]] && DIR=/tmp/xer-corpus

# repo  full-commit  path-in-repo  (one line per file; eval/cpm-vs-p6-2026-11-19.md)
FILES=(
  "MutahirAbbas/xer-checker 2296ee1da6aaf8442a2d2acab1c855a20caa45d1 data/CCA_R03_dt_24Oct11SC.xer"
  "MutahirAbbas/xer-checker 2296ee1da6aaf8442a2d2acab1c855a20caa45d1 data/Expressway_Project.xer"
  "kaustumbh7/critpath-primavera-p6-checker ba6b5bfec53871f92b068c6acbd571d86bede64a data/hotel-project.xer"
  "kaustumbh7/critpath-primavera-p6-checker ba6b5bfec53871f92b068c6acbd571d86bede64a data/terminal-building-airport.xer"
  "Badr1600/p6-analyzer ec457f30817bdedf3d2e49ad9820c9b8628b93b9 tests/fixtures/example_xer_file.xer"
  "ASHspace/PrimeveraXEREditor 9cb4f23fdf53ff5c65fec0f5cfe97d6b11820a61 src/test/java/resources/sample.xer"
)
# MPXJ commit read by eval/curves-to-project-2026-11-22.md and later checks.
MPXJ_COMMIT=8c7f83c

mkdir -p "$DIR/xer" "$DIR/repos"
fetch() {  # repo commit -> checkout dir
  local repo=$1 commit=$2 d="$DIR/repos/${1//\//__}"
  if [[ ! -d "$d/.git" ]]; then
    git init -q "$d"
    git -C "$d" remote add origin "https://github.com/$repo.git"
  fi
  if [[ "$(git -C "$d" rev-parse -q --verify HEAD 2>/dev/null)" != "$commit" ]]; then
    git -C "$d" fetch -q --depth=1 --filter=blob:none origin "$commit"
    git -C "$d" -c advice.detachedHead=false checkout -q FETCH_HEAD
  fi
  echo "$d"
}

n=0
for row in "${FILES[@]}"; do
  read -r repo commit path <<<"$row"
  d=$(fetch "$repo" "$commit")
  cp "$d/$path" "$DIR/xer/"
  n=$((n + 1))
  echo "  $(basename "$path")  <- $repo @ ${commit:0:7}"
done
echo "$n XER files in $DIR/xer"

if [[ $MPXJ == 1 ]]; then
  d="$DIR/mpxj"
  if [[ ! -d "$d/.git" ]]; then
    git clone -q --filter=blob:none --no-checkout --depth=200 https://github.com/joniles/mpxj.git "$d"
    git -C "$d" sparse-checkout set junit/data
  fi
  git -C "$d" -c advice.detachedHead=false checkout -q "$MPXJ_COMMIT" 2>/dev/null \
    || { echo "MPXJ $MPXJ_COMMIT not in the last 200 commits; checking out the default branch" >&2;
         git -C "$d" checkout -q FETCH_HEAD 2>/dev/null || git -C "$d" checkout -q; }
  echo "MPXJ junit/data at $(git -C "$d" rev-parse --short HEAD): $(find "$d/junit/data" -type f | wc -l) files in $d/junit/data"
fi
echo DONE

#!/bin/sh
# Fetch what eval/tcpd.mjs reads into DIR (default ./tcpd-data, outside git by .gitignore):
# the Turing Change Point Dataset series that ship in its repository, the annotations,
# and TCPDBench's published default-experiment predictions and scores.
# Neither the series nor the predictions are committed here: several series carry
# GPL or CC BY-SA terms (see each dataset's README in the TCPD repository).
set -eu
DIR=${1:-tcpd-data}
mkdir -p "$DIR/ds"
B=https://raw.githubusercontent.com/alan-turing-institute/TCPD/master
curl -sfS "$B/annotations.json" -o "$DIR/annotations.json"
for d in $(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$DIR/annotations.json','utf8'))).join(' '))"); do
  curl -sf "$B/datasets/$d/$d.json" -o "$DIR/ds/$d.json" || rm -f "$DIR/ds/$d.json"
done
if [ ! -d "$DIR/bench" ]; then
  git clone -q --depth 1 --filter=blob:none --sparse https://github.com/alan-turing-institute/TCPDBench "$DIR/bench"
fi
cd "$DIR/bench"
git sparse-checkout set --no-cone '/abed_results/*/default_*' '/analysis/output/scores/*'
git checkout -q

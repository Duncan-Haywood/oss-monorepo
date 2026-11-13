#!/bin/sh
# Fetch what eval/watch-nab.mjs reads into DIR (default ./nab-data, outside git by .gitignore):
# the 47 real-world series of the Numenta Anomaly Benchmark (NAB; Lavin and Ahmad 2015,
# arXiv:1510.03336; MIT licence, Copyright 2014-2024 Numenta Inc.) and its combined labels and
# windows. The data is not committed here; the output of the round is, in eval/watch-nab.out.txt.
set -eu
DIR=${1:-nab-data}
mkdir -p "$DIR/data"
B=https://raw.githubusercontent.com/numenta/NAB/master
curl -sfS "$B/labels/combined_windows.json" -o "$DIR/windows.json"
curl -sfS "$B/labels/combined_labels.json" -o "$DIR/labels.json"
for f in $(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$DIR/windows.json','utf8'))).filter(k=>k.startsWith('real')).join(' '))"); do
  mkdir -p "$DIR/data/$(dirname "$f")"
  curl -sfS "$B/data/$f" -o "$DIR/data/$f"
done
echo "$(find "$DIR/data" -name '*.csv' | wc -l) series in $DIR/data"

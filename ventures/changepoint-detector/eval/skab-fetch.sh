#!/bin/sh
# Fetch what eval/watch-skab.mjs reads into DIR (default ./skab-data, outside git by .gitignore): the 33 fault runs
# and the anomaly-free run of the Skoltech Anomaly Benchmark (SKAB v0.9; Katser and Kozitsin 2020,
# doi:10.34740/KAGGLE/DSV/1693952; github.com/waico/SKAB, GPL-3.0). The data is not committed here (it is GPL, this
# repository is MIT); only the round's output is, in eval/watch-skab.out.txt.
set -eu
DIR=${1:-skab-data}
B=https://raw.githubusercontent.com/waico/SKAB/master/data
mkdir -p "$DIR/valve1" "$DIR/valve2" "$DIR/other" "$DIR/anomaly-free"
for i in $(seq 0 15); do curl -sfS "$B/valve1/$i.csv" -o "$DIR/valve1/$i.csv"; done
for i in 1 2 3; do curl -sfS "$B/valve2/$i.csv" -o "$DIR/valve2/$i.csv"; done
for i in $(seq 1 14); do curl -sfS "$B/other/$i.csv" -o "$DIR/other/$i.csv"; done
curl -sfS "$B/anomaly-free/anomaly-free.csv" -o "$DIR/anomaly-free/anomaly-free.csv"
echo "$(find "$DIR" -name '*.csv' | wc -l) files in $DIR (33 fault runs and 1 anomaly-free run expected)"

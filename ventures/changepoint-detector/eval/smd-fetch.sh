#!/bin/sh
# Fetch what eval/watch-smd.mjs reads into DIR (default ./smd-data, outside git by .gitignore): the Server Machine
# Dataset (SMD; Su et al. 2019, "Robust Anomaly Detection for Multivariate Time Series through Stochastic Recurrent
# Neural Network", KDD; github.com/NetManAIOps/OmniAnomaly, MIT, Copyright (c) 2021 NetManAIOps-OmniAnomaly).
# 28 machines of a large internet company, 38 metrics each, one row a minute: a train half (no labels, the benchmark's
# normal history), a test half with a 0/1 label per row, and the metrics each labelled segment touched.
# The data is not committed; only the round's output is, in eval/watch-smd.out.txt.
set -eu
DIR=${1:-smd-data}
B=https://raw.githubusercontent.com/NetManAIOps/OmniAnomaly/master/ServerMachineDataset
mkdir -p "$DIR/train" "$DIR/test" "$DIR/test_label" "$DIR/interpretation_label"
for g in "1 8" "2 9" "3 11"; do
  set -- $g
  for i in $(seq 1 "$2"); do
    m="machine-$1-$i.txt"
    for d in train test test_label interpretation_label; do curl -sfS --retry 3 "$B/$d/$m" -o "$DIR/$d/$m"; done
  done
done
echo "$(find "$DIR" -name '*.txt' | wc -l) files in $DIR (28 machines x 4 = 112 expected)"

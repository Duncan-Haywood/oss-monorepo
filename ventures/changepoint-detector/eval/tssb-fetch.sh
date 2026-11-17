#!/bin/sh
# Fetch what eval/tssb.mjs reads into DIR (default ./tssb-data, outside git): the Time Series
# Segmentation Benchmark (TSSB; Ermshaus, Schaefer and Leser 2023; BSD-3 code) at a pinned commit,
# with its 75 annotated series (tssb/datasets) and the published per-series covering scores
# (tssb/notebooks/segmentation_covering_unknown.csv). The series derive from the UCR archive,
# which has its own terms, so they are not committed here.
set -eu
DIR=${1:-tssb-data}
PIN=e0c7a1f6cee6874e60cbacd3b8601f2de259606e
if [ ! -d "$DIR/.git" ]; then
  git clone -q --filter=blob:none --no-checkout https://github.com/ermshaua/time-series-segmentation-benchmark "$DIR"
fi
cd "$DIR"
git sparse-checkout set --no-cone '/tssb/datasets/*' '/tssb/notebooks/*.csv' '/LICENSE'
git checkout -q "$PIN"
echo "TSSB at $(git rev-parse HEAD): $(ls tssb/datasets/*.txt | grep -vc desc.txt) series"

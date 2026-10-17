#!/bin/sh
# Fetch the Speech Commands v0.02 parquet shards from the third-party Hugging Face mirror
# pollen-robotics/speech-commands-v0.02 (about 3.3 GB). usage: sh download.sh <outdir>
set -e
OUT=${1:?outdir}
B=https://huggingface.co/datasets/pollen-robotics/speech-commands-v0.02/resolve/main/data
mkdir -p "$OUT"
for i in 0 1 2 3 4 5; do curl -fL -o "$OUT/test-$i.parquet" "$B/test/test-0000$i-of-00006.parquet"; done
for i in 0 1 2 3 4; do curl -fL -o "$OUT/validation-$i.parquet" "$B/validation/validation-0000$i-of-00005.parquet"; done
for i in $(seq 0 42); do n=$(printf %05d "$i"); curl -fL -o "$OUT/train-$i.parquet" "$B/train/train-$n-of-00043.parquet"; done

#!/usr/bin/env bash
# Fetches the public recordings the benchmark reads into DIR (default
# ./eval-data). Nothing here is committed: the digits are CC BY-SA 4.0 and the
# pyannote sample is MIT; both are read in place.
#   - Free Spoken Digit Dataset (github.com/Jakobovski/free-spoken-digit-dataset):
#     6 speakers x 10 digits x takes 0-1, 8 kHz mono.
#   - pyannote-audio tutorials/assets/sample.wav + sample.rttm: 30 s of two
#     people talking, with hand-made speech turns.
set -euo pipefail
DIR=${1:-eval-data}
mkdir -p "$DIR/fsdd"
RAW=https://raw.githubusercontent.com
for s in jackson nicolas theo yweweler george lucas; do
  for d in 0 1 2 3 4 5 6 7 8 9; do
    for i in 0 1; do
      f="${d}_${s}_${i}.wav"
      [ -s "$DIR/fsdd/$f" ] || curl -sfL -o "$DIR/fsdd/$f" "$RAW/Jakobovski/free-spoken-digit-dataset/master/recordings/$f" || echo "missing $f" >&2
    done
  done
done
for f in sample.wav sample.rttm; do
  [ -s "$DIR/$f" ] || curl -sfL -o "$DIR/$f" "$RAW/pyannote/pyannote-audio/develop/tutorials/assets/$f"
done
echo "$(ls "$DIR/fsdd" | wc -l) digit recordings in $DIR/fsdd"

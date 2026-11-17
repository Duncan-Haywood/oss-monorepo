#!/bin/sh
# Noise floor for eval/repair-reserve-big.sh: the no-reserve configuration run a second time on the four weeks that end above
# their floors, seeds 7-12, two builds at a time. Builds are time-bound, so two runs of one configuration can differ.
#   sh eval/repair-reserve-big-noise.sh > eval/repair-reserve-big-noise.jsonl
cd "$(dirname "$0")/.."
for w in "90 252 0" "90 252 1" "100 280 0" "100 280 1"; do
  for s in 7 8 9 10 11 12; do echo "$w flow $s"; done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-guide.mjs $0 $1 $2 $3 $4'

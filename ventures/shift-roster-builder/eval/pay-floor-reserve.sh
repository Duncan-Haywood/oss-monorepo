#!/bin/sh
# The pre-registered reserve test (eval/pay-floor-reserve-prereg.md): seeds 6-17, 60 x 168 and 70 x 196, weeks 0-1, "full" and "off".
#   sh eval/pay-floor-reserve.sh > eval/pay-floor-reserve.jsonl
cd "$(dirname "$0")/.."
for s in 6 7 8 9 10 11 12 13 14 15 16 17; do
  for w in "60 168 0" "60 168 1" "70 196 0" "70 196 1"; do
    for r in full off; do echo "$s $r $w"; done
  done
done | xargs -P 2 -L 1 sh -c 'SEED=$0 RUNS=$1 node eval/pay-floor-reserve.mjs $2 $3 $4'

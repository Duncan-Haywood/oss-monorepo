#!/bin/sh
# The pre-registered budget-spent test (eval/pay-floor-spent-prereg.md): seeds 18-29, 60 x 168 and 70 x 196, weeks 0-1, "full" and "base".
#   sh eval/pay-floor-spent.sh > eval/pay-floor-spent.jsonl
cd "$(dirname "$0")/.."
for s in 18 19 20 21 22 23 24 25 26 27 28 29; do
  for w in "60 168 0" "60 168 1" "70 196 0" "70 196 1"; do
    for r in full base; do echo "$s $r $w"; done
  done
done | xargs -P 2 -L 1 sh -c 'SEED=$0 RUNS=$1 node eval/pay-floor-spent.mjs $2 $3 $4'

#!/bin/sh
# The new default (a spent try with a 4 s reserve) checked on the ten spent weeks of eval/pay-floor-spent-4s.jsonl, built with
# the default itself and with `scoreFloorSpent: false` (the old skip).
#   sh eval/pay-floor-spent-confirm.sh > eval/pay-floor-spent-confirm.jsonl
cd "$(dirname "$0")/.."
for w in "30 70 196 0" "30 70 196 1" "31 70 196 0" "31 70 196 1" "33 70 196 1" "34 70 196 1" "35 70 196 0" "36 70 196 1" "38 70 196 1" "40 70 196 0"; do
  for r in default nospent; do echo "$w $r"; done
done | xargs -P 2 -L 1 sh -c 'SEED=$0 RUNS=$4 node eval/pay-floor-spent.mjs $1 $2 $3'

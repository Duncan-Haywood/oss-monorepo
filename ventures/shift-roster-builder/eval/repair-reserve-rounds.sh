#!/bin/sh
# Exploratory, after the pre-registered 4 s test failed (eval/repair-reserve-4s.out.txt): the repair stopped on its 60 rounds,
# not the clock, so does a 4 s reserve pay once the repair may run 180 rounds? Same weeks and seeds 25-36, against flow2000 there.
#   sh eval/repair-reserve-rounds.sh > eval/repair-reserve-rounds.jsonl
cd "$(dirname "$0")/.."
export CFG='{"coverRepairBound":"flow","coverRepairReserveMs":4000,"coverRepairRounds":180}'
for w in "90 252 0" "90 252 1" "100 280 0" "100 280 1"; do
  for s in 25 26 27 28 29 30 31 32 33 34 35 36; do echo "$w $s"; done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-guide.mjs $0 $1 $2 "$CFG" $3' 

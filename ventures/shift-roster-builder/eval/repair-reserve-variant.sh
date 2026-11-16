#!/bin/sh
# Exploratory variants after the pre-registered 4 s test failed (eval/repair-reserve-4s.out.txt), on its weeks and seeds 25-36,
# each compared with flow2000 there. CFG is a JSON options string for eval/repair-guide.mjs:
#   CFG='{"coverRepairBound":"flow","coverRepairReserveMs":4000,"coverRepairRounds":180}' sh eval/repair-reserve-variant.sh > eval/repair-reserve-rounds180.jsonl
#   CFG='{"coverRepairBound":"flow","coverRepairReserveMs":4000,"coverRepairNodes":9000000}' sh eval/repair-reserve-variant.sh > eval/repair-reserve-nodes9m.jsonl
cd "$(dirname "$0")/.."
export CFG
for w in "90 252 0" "90 252 1" "100 280 0" "100 280 1"; do
  for s in ${SEEDS:-25 26 27 28 29 30 31 32 33 34 35 36}; do echo "$w $s"; done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-guide.mjs $0 $1 $2 "$CFG" $3'

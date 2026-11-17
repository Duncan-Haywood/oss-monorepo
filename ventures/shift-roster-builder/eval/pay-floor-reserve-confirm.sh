#!/bin/sh
# The pre-registered check of the new default (eval/pay-floor-reserve-prereg.md): the six weeks whose try needs more than 1.5 s
# and at most 6 s past the time left, built with the new default and with the old 1.5 s.
#   sh eval/pay-floor-reserve-confirm.sh > eval/pay-floor-reserve-confirm.jsonl
cd "$(dirname "$0")/.."
for w in "6 60 168 1" "7 60 168 0" "9 60 168 0" "11 70 196 0" "12 70 196 1" "17 60 168 1"; do
  for r in default 1500; do echo "$w $r"; done
done | xargs -P 2 -L 1 sh -c 'SEED=$0 RUNS=$4 node eval/pay-floor-reserve.mjs $1 $2 $3'

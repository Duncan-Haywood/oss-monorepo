#!/bin/sh
# The pre-registered fresh test (eval/repair-reserve-big-prereg.md): four above-floor weeks, seeds 13-24, flow against flow2000.
#   sh eval/repair-reserve-big-fresh.sh > eval/repair-reserve-big-fresh.jsonl
cd "$(dirname "$0")/.."
for w in "90 252 0" "90 252 1" "100 280 0" "100 280 1"; do
  for s in 13 14 15 16 17 18 19 20 21 22 23 24; do
    for c in flow flow2000; do echo "$w $c $s"; done
  done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-guide.mjs $0 $1 $2 $3 $4'

#!/bin/sh
# The pre-registered 4 s test (eval/repair-reserve-4s-prereg.md): four above-floor weeks, seeds 25-36, flow2000 against flow4000.
#   sh eval/repair-reserve-4s.sh > eval/repair-reserve-4s.jsonl
cd "$(dirname "$0")/.."
for w in "90 252 0" "90 252 1" "100 280 0" "100 280 1"; do
  for s in 25 26 27 28 29 30 31 32 33 34 35 36; do
    for c in flow2000 flow4000; do echo "$w $c $s"; done
  done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-guide.mjs $0 $1 $2 $3 $4'

#!/bin/sh
# The pre-registered 1.2 s test (eval/repair-reserve-1200-prereg.md): four above-floor weeks, seeds 37-48, flow2000 against flow1200.
#   sh eval/repair-reserve-1200.sh > eval/repair-reserve-1200.jsonl
cd "$(dirname "$0")/.."
for w in "90 252 0" "90 252 1" "100 280 0" "100 280 1"; do
  for s in 37 38 39 40 41 42 43 44 45 46 47 48; do
    for c in flow2000 flow1200; do echo "$w $c $s"; done
  done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-guide.mjs $0 $1 $2 $3 $4'

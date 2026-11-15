#!/bin/sh
# All 24 starts of eval/repair-flow.mjs, two at a time.  sh eval/repair-flow-run.sh > eval/repair-flow.jsonl
cd "$(dirname "$0")/.."
for w in "80 224 0" "80 224 1" "80 224 2" "90 252 0" "90 252 1" "90 252 2" "100 280 0" "100 280 1"; do
  for s in 1 2 3; do echo "$w $s"; done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-flow.mjs $0 $1 $2 $3'

#!/bin/sh
# End to end at the default 20 s budget (eval/repair-guide.mjs's generator): the depth-first repair against the flow-bounded one,
# each with no reserve (the default) and with a 2 s repair reserve, on the eight 80-100 person bench weeks, search seeds 4-6, two
# builds at a time.  sh eval/repair-flow-e2e.sh > eval/repair-flow-e2e.jsonl
cd "$(dirname "$0")/.."
for w in "80 224 0" "80 224 1" "80 224 2" "90 252 0" "90 252 1" "90 252 2" "100 280 0" "100 280 1"; do
  for s in 4 5 6; do
    for c in dfs flow dfs2000 flow2000; do
      echo "$w $c $s"
    done
  done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-guide.mjs $0 $1 $2 $3 $4'

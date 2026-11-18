#!/bin/sh
# The 15 bench builds of eval/repair-reserve-small.jsonl on which the repair ran (and found nothing), rebuilt with the repair skipped
# at a proven floor (the default now): same open hours, and how much of the 20 s budget comes back.
#   sh eval/repair-at-floor-bench.sh > eval/repair-at-floor-bench.jsonl
cd "$(dirname "$0")/.."
for w in "40 112 2" "50 140 1" "50 140 2" "60 168 0" "60 168 2"; do
  for s in 4 5 6; do echo "$w flow $s"; done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-guide.mjs $0 $1 $2 $3 $4'

#!/bin/sh
# Does a 2 s repair reserve pay on 30-60 person weeks? (README "The repair's neighbourhood under a flow bound" left it open.)
# End to end at the default 20 s budget (eval/repair-guide.mjs's generator): the flow-bounded repair with no reserve (the default),
# a 500 ms and a 2 s reserve, on 30 x 84, 40 x 112, 50 x 140 and 60 x 168 weeks 0-2, search seeds 4-6, two builds at a time.
#   sh eval/repair-reserve-small.sh > eval/repair-reserve-small.jsonl
#   python3 eval/repair-reserve-small-summary.py eval/repair-reserve-small.jsonl > eval/repair-reserve-small.out.txt
cd "$(dirname "$0")/.."
for w in "30 84 0" "30 84 1" "30 84 2" "40 112 0" "40 112 1" "40 112 2" "50 140 0" "50 140 1" "50 140 2" "60 168 0" "60 168 1" "60 168 2"; do
  for s in 4 5 6; do
    for c in flow flow500 flow2000; do
      echo "$w $c $s"
    done
  done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-guide.mjs $0 $1 $2 $3 $4'

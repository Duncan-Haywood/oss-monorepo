#!/bin/sh
# Does a 2 s repair reserve pay on the 350-400 copy weeks? The flow-bounded repair (the default) with no reserve against a
# 2 s reserve, on the eight 80-100 person bench weeks of eval/repair-flow-e2e.sh, fresh search seeds 7-12, the default 20 s
# budget, two builds at a time. Seeds 4-6 are eval/repair-flow-e2e.out.txt.
#   sh eval/repair-reserve-big.sh > eval/repair-reserve-big.jsonl; node eval/repair-reserve-big-sum.mjs eval/repair-reserve-big.jsonl
cd "$(dirname "$0")/.."
for w in "80 224 0" "80 224 1" "80 224 2" "90 252 0" "90 252 1" "90 252 2" "100 280 0" "100 280 1"; do
  for s in ${SEEDS:-7 8 9 10 11 12}; do
    for c in flow flow2000; do
      echo "$w $c $s"
    done
  done
done | xargs -P 2 -L 1 sh -c 'node eval/repair-guide.mjs $0 $1 $2 $3 $4'

#!/bin/sh
# The pre-registered comparison (eval/repair-deadline-prereg.md): seeds 54-65, "new" (defaults) and "old" (coverRepairDeadline: false).
#   sh eval/repair-deadline-ab.sh > eval/repair-deadline-ab.jsonl
# Diagnosis: the five late "new" builds of eval/stage-overrun-ab.jsonl, all crossed by the cover repair.
cd "$(dirname "$0")/.."
for s in ${SEEDS:-54 55 56 57 58 59 60 61 62 63 64 65}; do
  for w in "60 168 0" "60 168 1" "70 196 0" "70 196 1"; do
    echo "$s new $w {}"
    echo "$s old $w '{\"coverRepairDeadline\":false}'"
  done
done | xargs -P 2 -L 1 sh -c 'SEED=$0 node eval/stage-overrun.mjs $2 $3 $4 "$5" | sed "s/^{/{\"run\":\"$1\",/"'

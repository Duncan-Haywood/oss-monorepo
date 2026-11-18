#!/bin/sh
# The pre-registered comparison (eval/polish-deadline-prereg.md): seeds 66-77, "new" (defaults) and "old" (payPolishDeadline: false).
#   sh eval/polish-deadline-ab.sh > eval/polish-deadline-ab.jsonl
cd "$(dirname "$0")/.."
for s in ${SEEDS:-66 67 68 69 70 71 72 73 74 75 76 77}; do
  for w in "60 168 0" "60 168 1" "70 196 0" "70 196 1"; do
    echo "$s new $w {}"
    echo "$s old $w '{\"payPolishDeadline\":false}'"
  done
done | xargs -P 2 -L 1 sh -c 'SEED=$0 node eval/stage-overrun.mjs $2 $3 $4 "$5" | sed "s/^{/{\"run\":\"$1\",/"'

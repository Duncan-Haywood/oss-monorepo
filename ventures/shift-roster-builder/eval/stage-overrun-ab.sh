#!/bin/sh
# The pre-registered comparison (eval/stage-overrun-prereg.md): seeds 42-53, "new" (defaults) and "old" (coverPassDeadline: false).
#   sh eval/stage-overrun-ab.sh > eval/stage-overrun-ab.jsonl
# The diagnosis run (eval/stage-overrun.jsonl) was the "old" build on seeds 18-29 before the change.
cd "$(dirname "$0")/.."
for s in ${SEEDS:-42 43 44 45 46 47 48 49 50 51 52 53}; do
  for w in "60 168 0" "60 168 1" "70 196 0" "70 196 1"; do
    echo "$s new $w {}"
    echo "$s old $w {\"coverPassDeadline\":false}"
  done
done | xargs -P 2 -L 1 sh -c 'SEED=$0 node eval/stage-overrun.mjs $2 $3 $4 "$5" | sed "s/^{/{\"run\":\"$1\",/"'

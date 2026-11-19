#!/bin/sh
# The smallest --max-old-space-size, in MB and a multiple of STEP, at which a
# script finishes: by default eval/parse-only.mjs, or any script taking
# <checker dir> <model> [args...] such as eval/heap-compare.mjs
# (eval/entity-table-2026-11-18.md).
#   sh eval/min-heap.sh DIR MODEL STEP LO HI [SCRIPT [ARGS...]]
dir=$1; model=$2; step=$3; lo=$4; hi=$5; shift 5
script="$(dirname "$0")/parse-only.mjs"
if [ $# -gt 0 ]; then script=$1; shift; fi
while [ $((hi - lo)) -gt "$step" ]; do
  mid=$(( (lo + hi) / 2 / step * step ))
  if node --max-old-space-size=$mid "$script" "$dir" "$model" "$@" >/dev/null 2>&1; then hi=$mid; else lo=$mid; fi
done
echo "$hi"

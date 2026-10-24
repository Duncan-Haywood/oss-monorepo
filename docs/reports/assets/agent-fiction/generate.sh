#!/bin/bash
# Generate the stories: 4 models x 2 prompts x 10 runs, each a fresh `claude -p`
# with no tools, no settings and an empty working directory (so no project
# CLAUDE.md is loaded). Raw JSON goes to $OUT/out/.
#   OUT=/some/scratch/dir bash generate.sh
set -u
OUT=${OUT:?set OUT to a scratch directory}
mkdir -p "$OUT/out" "$OUT/empty"
one() {
  m=$1; c=$2; i=$3
  case $c in
    agent)   P="Write a short fiction story for another AI agent to read." ;;
    control) P="Write a short fiction story." ;;
  esac
  f="$OUT/out/$m.$c.$i.json"
  [ -s "$f" ] && return
  (cd "$OUT/empty" && timeout 600 claude -p "$P" --tools "" --setting-sources "" \
     --model "$m" --output-format json < /dev/null > "$f.tmp" 2> "$f.err") && mv "$f.tmp" "$f"
}
export -f one; export OUT
for m in claude-opus-5-5 claude-sonnet-5-5 claude-haiku-5-5 claude-fable-5-1; do
  for c in agent control; do for i in $(seq -w 1 10); do echo "$m $c $i"; done; done
done | xargs -P 8 -L 1 bash -c 'one "$@"' _

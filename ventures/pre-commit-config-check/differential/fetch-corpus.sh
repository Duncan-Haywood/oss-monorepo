#!/bin/sh
# Refetch the real-config corpus named in corpus.json into $1 (default ./corpus-files).
# The files belong to their projects and are not committed here.
set -eu
out=${1:-corpus-files}
mkdir -p "$out"
node -e 'for (const f of require("./corpus.json").files) console.log(f.repo)' | while read -r repo; do
  name=$(echo "$repo" | tr '/' '_')
  curl -fsS -m 20 -o "$out/$name.yaml" "https://raw.githubusercontent.com/$repo/HEAD/.pre-commit-config.yaml" || echo "skip $repo" >&2
done
ls "$out" | wc -l

#!/bin/sh
# Fetches pyproject.toml from the default branch of each repository in corpus-repos.txt
# into the folder given (default ./corpus). The files are not kept in this repository.
#   sh eval/fetch-corpus.sh /tmp/corpus && node eval/corpus-summary.mjs /tmp/corpus/*.toml
out=${1:-corpus}; mkdir -p "$out"
while read -r r; do
  n=$(echo "$r" | tr / _)
  for b in main master; do curl -sfL --max-time 15 -o "$out/$n.toml" "https://raw.githubusercontent.com/$r/$b/pyproject.toml" && break; done
done < "$(dirname "$0")/corpus-repos.txt"
ls "$out" | wc -l

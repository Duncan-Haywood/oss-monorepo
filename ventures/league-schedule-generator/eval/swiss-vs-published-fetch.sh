#!/bin/sh
# Fetch the real Swiss events eval/swiss-vs-published.mjs replays: gbtami/swisspairing's
# benchmarks/fixtures (MIT), pinned to the commit the 2026-11-21 run read. About 2 MB.
#   sh eval/swiss-vs-published-fetch.sh /tmp/swisspairing
#   node eval/swiss-vs-published.mjs /tmp/swisspairing/benchmarks/fixtures
set -eu
dest="${1:-/tmp/swisspairing}"
sha=193ad9992af4a5b1394595d93aa881f95d9dbba6
git clone -q --filter=blob:none --no-checkout https://github.com/gbtami/swisspairing.git "$dest"
cd "$dest"
git sparse-checkout set --no-cone '/benchmarks/fixtures/' '/LICENSE'
git checkout -q "$sha"
echo "fixtures at $dest/benchmarks/fixtures (commit $sha)"

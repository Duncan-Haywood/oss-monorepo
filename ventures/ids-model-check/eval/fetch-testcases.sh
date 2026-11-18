#!/bin/sh
# Fetches buildingSMART's IDS test pairs (CC BY-ND 4.0, not committed here) next
# to this script, pinned to the commit the README's scores were measured on.
set -e
cd "$(dirname "$0")"
COMMIT=${IDS_COMMIT:-870f9c4e6e8f414e737b4d84ca1aa9b46fc6c8f3}
if [ ! -d IDS ]; then
  git clone --filter=blob:none --no-checkout https://github.com/buildingSMART/IDS.git IDS
fi
cd IDS
git sparse-checkout set Documentation/ImplementersDocumentation/TestCases
git fetch --depth 1 origin "$COMMIT" 2>/dev/null || git fetch origin
git checkout -q "$COMMIT"
echo "test cases at $(pwd)/Documentation/ImplementersDocumentation/TestCases ($(git rev-parse --short HEAD))"

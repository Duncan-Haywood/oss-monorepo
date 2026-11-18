#!/bin/sh
# Fetches buildingSMART's BCF 2.1 XML schemas (CC BY-ND 4.0, not committed here)
# next to this script, so engine.test.mjs validates the BCF export against them
# with xmllint. Pinned to the release_2_1 branch the export targets.
set -e
cd "$(dirname "$0")"
mkdir -p bcf-xsd
for f in markup.xsd visinfo.xsd project.xsd version.xsd; do
  curl -fsSL -o "bcf-xsd/$f" "https://raw.githubusercontent.com/buildingSMART/BCF-XML/${BCF_REF:-release_2_1}/Schemas/$f"
done
echo "BCF 2.1 schemas at $(pwd)/bcf-xsd"

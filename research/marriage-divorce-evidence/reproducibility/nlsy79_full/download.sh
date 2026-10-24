#!/bin/sh
# Official NLSY79 public-use release, all rounds 1979-2022 (U.S. Bureau of Labor Statistics,
# NLS Investigator "all variables" archive; no login). 450 MB zip holding a 6.7 GB CSV with
# 178,014 columns and the .cdb codebook. Never unzip it: extract_nlsy79_full.py streams the
# columns it needs straight out of the zip. The checksum is the one recorded in
# ../longitudinal/source_manifest.json when the original analyses were built (2026-10-19).
set -eu
cd "$(dirname "$0")"
mkdir -p raw
f=raw/nlsy79_all_1979-2022.zip
[ -f "$f" ] || curl --fail -sSL https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip -o "$f"
sha256sum -c SHA256SUMS
# 2026-10-20 extension columns (origin, siblings, religion, net wealth, occupation), streamed into work/:
#   python3 -I extract_ext.py raw/nlsy79_all_1979-2022.zip work

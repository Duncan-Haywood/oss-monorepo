#!/bin/sh
# How Couples Meet and Stay Together (HCMST) 2009-2017: wave 1-3 public file v3.04 and the
# wave 4, 5 and 6 supplements (Stata), from the Stanford Digital Repository
# (https://purl.stanford.edu/ns183dp7831). Licence: Open Data Commons Public Domain
# Dedication and License (PDDL) 1.0; users agree not to identify individuals.
# stacks.stanford.edu chains to the "emSign Root CA - G1" root; if your curl lacks it, point
# CURL_CA_BUNDLE at a bundle that has it (e.g. python -m certifi).
set -eu
cd "$(dirname "$0")"
mkdir -p raw
base='https://stacks.stanford.edu/file/druid:ns183dp7831'
for f in HCMST_ver_3.04_Stata.zip wave_4_supplement_v1_2.zip HCMST_wave_5_supplement_ver_1.zip HCMST_wave_6_public_v1_stata.zip; do
  [ -f "raw/$f" ] || curl --fail -sSL "$base/$f" -o "raw/$f"
done
cd raw
sha256sum -c ../SHA256SUMS
for z in *.zip; do unzip -o -q "$z"; done

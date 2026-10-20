#!/bin/sh
# NSFG 2002 (Cycle 6) female respondent public-use file and its Stata dictionary.
# The official host (ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG/) was blocked from
# the cloud session that built this; these are byte copies kept by Allen Downey for Think Stats
# (MIT-licensed code repository; the data remain NCHS public-use data). Checksums below were
# recorded on 2026-10-19; METHODS.md says how the copy was checked against official counts.
# The official equivalents are 2002FemResp.dat and stata/2002FemResp.dct under the NCHS path.
set -eu
cd "$(dirname "$0")"
mkdir -p raw
base='https://raw.githubusercontent.com/AllenDowney/ThinkStats2/master/code'
for f in 2002FemResp.dat.gz 2002FemResp.dct; do
  [ -f "raw/$f" ] || curl --fail -sSL "$base/$f" -o "raw/$f"
done
cd raw
sha256sum -c ../SHA256SUMS

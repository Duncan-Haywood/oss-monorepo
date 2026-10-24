#!/bin/sh
# NSFG 2002 (Cycle 6) female respondent public-use file and its Stata dictionary.
# Preferred: the official NCHS copies at ftp.cdc.gov (reachable from cloud sessions since
# 2026-10-20). Fallback: the byte copies Allen Downey keeps for Think Stats (MIT-licensed code
# repository; the data remain NCHS public-use data), used when CDC was blocked on 2026-10-19.
# On 2026-10-20 the official 2002FemResp.dat had SHA-256 d63bc948..., identical to the
# decompressed mirror 2002FemResp.dat.gz, and the official stata/2002FemResp.dct was
# byte-identical to the mirror's. SHA256SUMS records all three files; train_models.py reads
# whichever data file is present.
set -eu
cd "$(dirname "$0")"
mkdir -p raw
cdc='https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG'
mirror='https://raw.githubusercontent.com/AllenDowney/ThinkStats2/master/code'
if [ ! -f raw/2002FemResp.dat ] && [ ! -f raw/2002FemResp.dat.gz ]; then
  curl --fail -sSL "$cdc/2002FemResp.dat" -o raw/2002FemResp.dat \
    || { rm -f raw/2002FemResp.dat; curl --fail -sSL "$mirror/2002FemResp.dat.gz" -o raw/2002FemResp.dat.gz; }
fi
if [ ! -f raw/2002FemResp.dct ]; then
  curl --fail -sSL "$cdc/stata/2002FemResp.dct" -o raw/2002FemResp.dct \
    || curl --fail -sSL "$mirror/2002FemResp.dct" -o raw/2002FemResp.dct
fi
cd raw
sha256sum -c --ignore-missing ../SHA256SUMS

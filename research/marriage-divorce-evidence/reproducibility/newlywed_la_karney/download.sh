#!/bin/sh
# Smith, Block & Karney, "Baseline Predictors of Divorce", OSF project hxn84
# (https://osf.io/hxn84), the files behind "Individual, Interpersonal, and Socioeconomic
# Predictors of Divorce: A 12-Year Prospective Study". 368 newlywed couples in Los Angeles
# County (baseline 2009-10, nine follow-ups to 2021-22).
# The OSF project states no licence, so the couple-level rows are NOT committed to git:
# this script fetches them into raw/ (git-ignored) and checks the SHA-256 sums.
set -eu
cd "$(dirname "$0")"
mkdir -p raw
get() { [ -f "raw/$2" ] || curl --fail -sSL "https://osf.io/download/$1/" -o "raw/$2"; }
get srdwb Divorce_Data.csv
get ejfym Divorce_Codebook.docx
get sbdw8 Divorce_Code.R
get 6b3u9 Divorce_Supplement.docx
get m59k4 README.txt
cd raw
sha256sum -c ../SHA256SUMS

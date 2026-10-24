#!/bin/sh
# Thornes & Collard (1979) "Who Divorces?" cross-tabulation of pre- and extramarital sex by
# marital status and gender (1,036 people), as reported in Gilbert (1981) and shipped as
# vcd::PreSex. Rdatasets CSV copy; checksum recorded 2026-10-19.
set -eu
cd "$(dirname "$0")"
mkdir -p raw
[ -f raw/PreSex.csv ] || curl --fail -sSL https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/vcd/PreSex.csv -o raw/PreSex.csv
cd raw && sha256sum -c ../SHA256SUMS

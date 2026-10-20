#!/bin/sh
# SIPP sources for this folder (U.S. Census Bureau public-use files; no login).
# 1. 2001/2004/2008 panels, wave-2 topical modules (marital, education, migration history):
#    fixed-width data, Census's SAS input layouts and data dictionaries, checked against SHA256SUMS.
# 2. 2018-2025 annual public-use files and two-year longitudinal weights: extract_pu.py streams
#    each archive, records its SHA-256 in WORK/manifest.jsonl (copied to downloads.json here),
#    keeps one row per person and deletes the archive.
# Usage: sh download.sh WORK_DIR
set -eu
here=$(cd "$(dirname "$0")" && pwd)
work=${1:?usage: sh download.sh WORK_DIR}
mkdir -p "$work/raw" "$work/pu"
base=https://www2.census.gov/programs-surveys/sipp/data/datasets
cd "$work/raw"
for p in 2001:01 2004:04 2008:08; do
  y=${p%%:*}; s=${p##*:}
  [ -f "p${s}putm2.zip" ] || curl --fail -sSL -o "p${s}putm2.zip" "$base/$y/w2/p${s}putm2.zip"
  [ -f "p${s}putm2.sas" ] || curl --fail -sSL -o "p${s}putm2.sas" "$base/$y/p${s}putm2.sas"
done
[ -f p01ptm2d.txt ] || curl --fail -sSL -o p01ptm2d.txt "$base/2001/w2/p01ptm2d.txt"
[ -f p04tm2d.txt ] || curl --fail -sSL -o p04tm2d.txt "$base/2004/w2/p04tm2d.txt"
[ -f p08tm2d.txt ] || curl --fail -sSL -o p08tm2d.txt "$base/2008/w2/p08tm2d.txt"
sha256sum -c "$here/SHA256SUMS"
python3 -I "$here/extract_pu.py" "$work/pu" 2018 2019 2020 2021 2022 2023 2024 2025
# 2026-10-20 extension: occupation and wealth components (re-downloads the annual files; downloads_ext.json)
python3 -I "$here/extract_ext.py" "$work/pu" 2018 2019 2020 2021 2022 2023 2024 2025

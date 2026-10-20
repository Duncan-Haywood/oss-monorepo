#!/bin/sh
# ACS 1-year person PUMS, 2008-2024 (2020 from the experimental-estimates path). extract.py
# downloads each national csv_pus.zip from www2.census.gov, records its SHA-256 and size in
# WORK/manifest.jsonl (copied to downloads.json here; compare before trusting a re-download),
# keeps the people married at some point in the past 12 months with the needed columns and all
# 80 replicate weights as WORK/acs_YYYY.parquet, and deletes the ~0.6 GB archive.
# Usage: sh download.sh WORK_DIR [YEAR ...]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
work=${1:?usage: sh download.sh WORK_DIR [YEAR ...]}
shift
years=${*:-"2024 2023 2022 2021 2020 2019 2018 2017 2016 2015 2014 2013 2012 2011 2010 2009 2008"}
python3 -I "$here/extract.py" "$work" $years
# Detail pass for the pooled years (race detail, industry, SOC, housing tenure and income; see
# extract_detail.py and downloads_detail.json) and the data dictionaries used for code labels.
python3 -I "$here/extract_detail.py" "$work" 2024 2023 2022 2021 2019
mkdir -p "$work/dict"
for y in 2019 2021 2022 2023 2024; do
  [ -f "$work/dict/PUMS_Data_Dictionary_$y.csv" ] || curl --fail -sSL -o "$work/dict/PUMS_Data_Dictionary_$y.csv" \
    "https://www2.census.gov/programs-surveys/acs/tech_docs/pums/data_dict/PUMS_Data_Dictionary_$y.csv"
done

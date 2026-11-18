#!/bin/sh
# Daily US Federal Reserve exchange rates (H.10, via FRED), repackaged by github.com/datasets/exchange-rates
# under the Public Domain Dedication and License. Not committed (7.6 MB); used by eval/update-rate-pegs.mjs.
# usage: sh eval/fx-pegs-fetch.sh fx-data
set -e
DIR="${1:-fx-data}"
mkdir -p "$DIR"
curl -sSfL -o "$DIR/daily.csv" https://raw.githubusercontent.com/datasets/exchange-rates/main/data/daily.csv
wc -l "$DIR/daily.csv"

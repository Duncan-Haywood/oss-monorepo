#!/bin/sh
# The New York Times COVID-19 data (github.com/nytimes/covid-19-data), state-level cumulative cases, one row
# per state per day, 2020-01-21..2023-03-23. Licence: the repository's own terms (free for non-commercial use with
# attribution to The New York Times), so the file is NOT committed; only derived verdicts are. About 2.2 MB.
# Used by eval/update-rate-spells-nyt.mjs.
# usage: sh eval/nyt-states-fetch.sh nyt-data
set -e
DIR="${1:-nyt-data}"
mkdir -p "$DIR"
curl -sSfL -o "$DIR/us-states.csv" https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-states.csv
wc -l "$DIR/us-states.csv"

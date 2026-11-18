#!/bin/sh
# JHU CSSE COVID-19 daily US confirmed cases (time series, CC BY 4.0, github.com/CSSEGISandData/COVID-19),
# and the repository README whose "Irregular Update Schedules" section labels each state's reporting
# schedule changes. Not committed (about 10 MB); used by eval/update-rate-covid-schedules.mjs.
# usage: sh eval/covid-schedules-fetch.sh covid-data
set -e
DIR="${1:-covid-data}"
BASE=https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data
mkdir -p "$DIR"
curl -sSfL -o "$DIR/time_series_covid19_confirmed_US.csv" "$BASE/csse_covid_19_time_series/time_series_covid19_confirmed_US.csv"
curl -sSfL -o "$DIR/README.md" "$BASE/README.md"
wc -l "$DIR/time_series_covid19_confirmed_US.csv"

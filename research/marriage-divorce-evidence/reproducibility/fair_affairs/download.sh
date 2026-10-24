#!/bin/sh
# Ray Fair's extramarital-affairs survey data (Fair 1978, Journal of Political Economy):
#   fair.csv     Redbook magazine 1974 survey, 6,366 married women
#   fair_pt.csv  Psychology Today 1969 survey, 601 married men and women
# Copies bundled with statsmodels ("included with permission of the author"), pinned to the
# v0.14.4 tag. AER_Affairs.csv is the independent Rdatasets copy of the 601-person file
# (R package AER), used only to cross-check fair_pt.csv. Ray Fair also posts the data at
# https://fairmodel.econ.yale.edu/rayfair/pdf/2011b.htm (not reachable from the cloud session).
set -eu
cd "$(dirname "$0")"
mkdir -p raw
sm='https://raw.githubusercontent.com/statsmodels/statsmodels/v0.14.4/statsmodels/datasets/fair'
[ -f raw/fair.csv ] || curl --fail -sSL "$sm/fair.csv" -o raw/fair.csv
[ -f raw/fair_pt.csv ] || curl --fail -sSL "$sm/fair_pt.csv" -o raw/fair_pt.csv
[ -f raw/AER_Affairs.csv ] || curl --fail -sSL https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/AER/Affairs.csv -o raw/AER_Affairs.csv
cd raw
sha256sum -c ../SHA256SUMS

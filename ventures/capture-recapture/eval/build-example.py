#!/usr/bin/env python3
"""Builds data/lily-pond-chorus-frogs.csv from the USGS release.

Source: Muths, E.L., 2020, Demographic data from two chorus frog populations
in Colorado: U.S. Geological Survey data release,
https://doi.org/10.5066/P9BZAPLB (file Cameron_Lily_cmr_1986-2014.csv).

Usage: python3 eval/build-example.py RAW.csv > data/lily-pond-chorus-frogs.csv

One row per frog per year it was caught; columns year, id, sex and occasion1..5
(the survey dates within that breeding season, in order); an occasion that
year did not have is blank. Frogs never caught in a year get no row for it.
The raw header has one malformed date, "5/25/2007\\6", between 24-May-06 and
26-May-06; it is read as 25 May 2006.
"""
import csv, re, sys
from datetime import datetime

MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()

def parse_date(h):
    if h == "5/25/2007\\6":
        return datetime(2006, 5, 25)
    d, mon, y = h.split("-")
    y = int(y)
    return datetime(1900 + y if y >= 50 else 2000 + y, MONTHS.index(mon) + 1, int(d))

rows = list(csv.reader(open(sys.argv[1], encoding="latin-1")))
header, body = rows[0], rows[1:]
dates = [(i, parse_date(h)) for i, h in enumerate(header) if i >= 3]
years = {}
for i, d in dates:
    years.setdefault(d.year, []).append((d, i))
width = max(len(v) for v in years.values())
out = csv.writer(sys.stdout, lineterminator="\n")
out.writerow(["year", "id", "sex"] + [f"occasion{j + 1}" for j in range(width)])
for y in sorted(years):
    cols = [i for _, i in sorted(years[y])]
    for r in body:
        h = [r[i] for i in cols]
        assert set(h) <= {"0", "1"}, (y, r[0], h)
        if "1" in h:
            out.writerow([y, r[0], r[2]] + h + [""] * (width - len(h)))

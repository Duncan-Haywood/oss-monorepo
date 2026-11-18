"""Rebuild data/central-park-tmax-normals.csv from the NOAA GHCN-Daily station file.

    python3 eval/extract_example.py USW00094728.csv > data/central-park-tmax-normals.csv

The station file is
https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00094728.csv
(public domain, NOAA NCEI). For each calendar day (29 February dropped) and each
30-year period, the mean daily maximum temperature in degrees C over the years
that have a TMAX value with a blank quality flag. Standard library only.
"""
import csv
import sys

PERIODS = [(1871, 1900), (1901, 1930), (1931, 1960), (1961, 1990), (1991, 2020)]


def main(path):
    sums = {p: {} for p in PERIODS}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            date = row["DATE"]
            year, md = int(date[:4]), date[5:]
            if md == "02-29":
                continue
            period = next((p for p in PERIODS if p[0] <= year <= p[1]), None)
            if period is None:
                continue
            value = row["TMAX"].strip()
            flags = (row["TMAX_ATTRIBUTES"].split(",") + ["", ""])[:2]
            if not value or flags[1].strip():
                continue
            s = sums[period].setdefault(md, [0, 0])
            s[0] += int(value)
            s[1] += 1
    days = sorted(sums[PERIODS[-1]])
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(["day"] + [f"tmax_{a}_{b}" for a, b in PERIODS])
    for md in days:
        out.writerow([md] + [f"{sums[p][md][0] / sums[p][md][1] / 10:.2f}" for p in PERIODS])


if __name__ == "__main__":
    main(sys.argv[1])

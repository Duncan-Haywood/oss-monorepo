"""Rebuild data/central-park-july.csv from NOAA's GHCN-Daily station file.

    curl -sSO https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00094728.csv
    python3 ventures/wasserstein-distance/eval/extract_example.py USW00094728.csv

Keeps July days of 1951-1980 and 1991-2020 with both TMAX and TMIN present
and no quality flag, and converts tenths of a degree C to degrees C.
"""

import csv
import pathlib
import sys

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "central-park-july.csv"


def flag(attrs):
    parts = (attrs or "").split(",")
    return parts[1].strip() if len(parts) > 1 else ""


rows = []
with open(sys.argv[1], newline="") as f:
    for d in csv.DictReader(f):
        y, m = int(d["DATE"][:4]), int(d["DATE"][5:7])
        if m != 7:
            continue
        period = "1951-1980" if 1951 <= y <= 1980 else "1991-2020" if 1991 <= y <= 2020 else None
        tx, tn = d["TMAX"].strip(), d["TMIN"].strip()
        if not period or not tx or not tn or flag(d["TMAX_ATTRIBUTES"]) or flag(d["TMIN_ATTRIBUTES"]):
            continue
        rows.append((d["DATE"], period, int(tx) / 10, int(tn) / 10))

with OUT.open("w") as f:
    f.write("date,period,tmax_c,tmin_c\n")
    for r in rows:
        f.write(f"{r[0]},{r[1]},{r[2]:g},{r[3]:g}\n")
print(len(rows), "rows written to", OUT)

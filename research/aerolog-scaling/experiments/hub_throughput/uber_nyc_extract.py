"""Milestone 6l, data step: pickups per 15-minute bin per day from the Uber NYC 2014 FOIL data.

Source: FiveThirtyEight, "uber-tlc-foil-response" (data from the NYC Taxi & Limousine Commission under a Freedom of
Information Law request), https://github.com/fivethirtyeight/uber-tlc-foil-response, files
uber-trip-data/uber-raw-data-{apr..sep}14.csv (4,534,327 pickups, Apr to Sep 2014, minute timestamps, lat/lon).
Licence: CC BY 4.0 (FiveThirtyEight data repository). Only aggregate counts are written here.

Catchments, fixed before any count was looked at: the whole file ("city"), and the five busiest cells of a
0.02 deg latitude x 0.025 deg longitude grid (about 2.2 km x 2.1 km at 40.7 N, close to a delivery hub's
catchment), ranked by total pickups over the six months. Output: uber_nyc_counts.json
{catchment: {"cell": [lat0, lon0] or null, "days": {"YYYY-MM-DD": [96 counts]}}}.

Usage: python3 uber_nyc_extract.py <directory with the six csv files>
"""
import csv
import json
import math
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
MONTHS = ("apr", "may", "jun", "jul", "aug", "sep")
DLAT, DLON = 0.02, 0.025


def cell(lat, lon):
    return (math.floor(lat / DLAT), math.floor(lon / DLON))


def main(src):
    by_cell = defaultdict(Counter)   # cell -> Counter((day, bin))
    city = Counter()
    n = 0
    for m in MONTHS:
        with open(os.path.join(src, f"uber-raw-data-{m}14.csv")) as f:
            rd = csv.reader(f)
            next(rd)
            for dt, lat, lon, _base in rd:
                d, t = dt.split(" ")
                mo, dd, yy = d.split("/")
                hh, mi, _ = t.split(":")
                day = f"{yy}-{int(mo):02d}-{int(dd):02d}"
                b = int(hh) * 4 + int(mi) // 15
                city[(day, b)] += 1
                by_cell[cell(float(lat), float(lon))][(day, b)] += 1
                n += 1
    top = sorted(by_cell, key=lambda c: -sum(by_cell[c].values()))[:5]
    days = sorted({d for d, _ in city})
    out = {"_source": "FiveThirtyEight uber-tlc-foil-response (NYC TLC FOIL), uber-raw-data-apr14..sep14.csv, CC BY 4.0",
           "_pickups": n, "_grid_deg": [DLAT, DLON]}

    def series(cnt):
        return {d: [cnt.get((d, b), 0) for b in range(96)] for d in days}

    out["city"] = {"cell": None, "days": series(city)}
    for i, c in enumerate(top, 1):
        out[f"cell{i}"] = {"cell": [round(c[0] * DLAT, 3), round(c[1] * DLON, 3)], "days": series(by_cell[c])}
    with open(os.path.join(HERE, "uber_nyc_counts.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{n} pickups, {len(days)} days ({days[0]} to {days[-1]})")
    for k in ["city"] + [f"cell{i}" for i in range(1, 6)]:
        tot = sum(sum(v) for v in out[k]["days"].values())
        print(f"  {k}: cell SW corner {out[k]['cell']}, {tot} pickups, {tot / len(days):.0f} per day")


if __name__ == "__main__":
    main(sys.argv[1])

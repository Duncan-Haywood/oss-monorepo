"""Milestone 11a, data step: delivery destinations around a hub from measured Uber pickups (NYC, April 2014).

Source: FiveThirtyEight, "uber-tlc-foil-response" (NYC TLC data released under a Freedom of Information Law request),
https://github.com/fivethirtyeight/uber-tlc-foil-response, file uber-trip-data/uber-raw-data-apr14.csv
(pickups with lat/lon to 1e-4 deg). Licence: CC BY 4.0. Pickups stand in for on-demand delivery addresses.

Hub, fixed before the file was opened for this milestone: the centre of milestone 6l's busiest grid cell (cell1,
SW corner 40.74 N, 74.00 W; cell 0.02 x 0.025 deg), i.e. 40.750 N, 73.9875 W. Positions are projected to a local
east/north plane in metres (equirectangular about the hub; under 0.1% error at 10 km). Every pickup within 10 km
is kept; the experiments filter to their own radius. Output: nyc_destinations.json, a seeded random sample of
20,000 points as [east, north] rounded to 10 m (aggregate locations only, no times).

Usage: python3 destinations_extract.py <path to uber-raw-data-apr14.csv>
"""
import csv
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HUB = (40.750, -73.9875)
R_EARTH = 6371008.8          # mean Earth radius, m (IUGG)
KEEP_M = 10000.0
SAMPLE = 20000


def project(lat, lon):
    k = math.pi / 180 * R_EARTH
    return ((lon - HUB[1]) * k * math.cos(math.radians(HUB[0])), (lat - HUB[0]) * k)


def main(path):
    pts, n = [], 0
    with open(path) as f:
        rd = csv.reader(f)
        next(rd)
        for _dt, lat, lon, _b in rd:
            n += 1
            x, y = project(float(lat), float(lon))
            if x * x + y * y <= KEEP_M ** 2:
                pts.append((round(x, -1), round(y, -1)))
    rnd = random.Random(20261111)
    sample = rnd.sample(pts, SAMPLE)
    out = {"_source": "FiveThirtyEight uber-tlc-foil-response (NYC TLC FOIL), uber-raw-data-apr14.csv, CC BY 4.0",
           "_hub_latlon": HUB, "_pickups_in_file": n, "_pickups_within_10km": len(pts), "_keep_m": KEEP_M,
           "points_m": [[int(x), int(y)] for x, y in sample]}
    with open(os.path.join(HERE, "nyc_destinations.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{n} pickups, {len(pts)} within {KEEP_M:.0f} m, wrote {SAMPLE}")


if __name__ == "__main__":
    main(sys.argv[1])

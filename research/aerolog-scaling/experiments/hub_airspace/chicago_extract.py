"""Milestone 11bd, data step: delivery destinations around a Chicago hub from measured Divvy bike-share trip ends
(April 2024), the second city for the leak-budget transfer test (chicago_transfer.py).

Source: Divvy (Lyft Bikes and Scooters for the City of Chicago), system data, file 202404-divvy-tripdata.zip,
https://divvy-tripdata.s3.amazonaws.com/202404-divvy-tripdata.zip (415,025 trips; end_lat / end_lng). Trip ENDS
stand in for delivery addresses, as 11a's Uber pickups do for NYC. The data are published under the Divvy Data
License Agreement (https://divvybikes.com/data-license-agreement); that page did not answer from the session that
wrote this script, so the licence text was not re-read and NO derived points are committed: this script writes its
sample to a local cache, and only per-layout analysis results (chicago_transfer.json.gz) are in the repository.

Hub, fixed by a rule before any layout was built: State and Madison (41.8820 N, 87.6278 W), the origin of Chicago's
street numbering, in the Loop (NYC's hub sat in 6l's busiest cell; a similar central-business-district choice). The
author had seen the five most common end points (all within 2 km) before writing this, nothing else.

Precision, the main difference from the NYC file. NYC's pickups carry 1e-4 deg (17,076 distinct 10 m points in the
20,000 sample). Divvy ends are either at a docking station (one coordinate per station) or, for e-bikes left away
from a station, rounded to 0.01 deg (some to 0.1 deg by trailing-zero loss: "41.9"). Within 10 km of the hub there
are only 795 distinct end points. Delivery addresses are not stacked on 795 points, and terminal conflicts (250 m
terminal radius, R = 50 m) would be inflated by stacking, so each end is spread, with a seeded generator:
  station end      uniform in a disc of JITTER_M = 200 m about the station (about half the station spacing
                   in the Loop and near North Side; a modelling choice, disclosed, not sourced);
  dockless end     uniform over its rounding cell (+/- 0.005 deg when two decimals are given, +/- 0.05 deg when
                   one), as the true point is somewhere in that cell;
then projected (equirectangular about the hub) and rounded to 10 m like NYC's. A dockless end whose CELL CENTRE is
beyond 10 km is dropped; one spread past 10 km is dropped by the experiments' own radius filter. Lake Michigan lies
1.5 to 2 km east of the hub, so destinations fill roughly a half disc (NYC's 10 km disc is about two thirds land).

Output: <CHI_DEST>/chicago_destinations.json (default ./chicago_cache/), a seeded random sample of 20,000 points as
[east, north] in metres within 10 km, the same shape as nyc_destinations.json.

Usage: python3 chicago_extract.py <path to 202404-divvy-tripdata.csv>
"""
import csv
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HUB = (41.8820, -87.6278)
R_EARTH = 6371008.8
KEEP_M = 10000.0
SAMPLE = 20000
JITTER_M = 200.0
SEED = 20261123


def out_path():
    return os.path.join(os.environ.get("CHI_DEST", os.path.join(HERE, "chicago_cache")), "chicago_destinations.json")


def project(lat, lon):
    k = math.pi / 180 * R_EARTH
    return ((lon - HUB[1]) * k * math.cos(math.radians(HUB[0])), (lat - HUB[0]) * k)


def decimals(s):
    return len(s.split(".")[1]) if "." in s else 0


def spread(row, rnd):
    """One trip end as a jittered (east, north) in metres, or None if it has no position."""
    la_s, lo_s = row["end_lat"], row["end_lng"]
    if not la_s or not lo_s:
        return None
    la, lo = float(la_s), float(lo_s)
    if row["end_station_id"]:
        x, y = project(la, lo)
        r, a = JITTER_M * math.sqrt(rnd.random()), rnd.uniform(0, 2 * math.pi)
        return x + r * math.cos(a), y + r * math.sin(a)
    cx, cy = project(la, lo)
    if cx * cx + cy * cy > KEEP_M ** 2:
        return None
    hla = 0.5 * 10.0 ** -min(decimals(la_s), 6)
    hlo = 0.5 * 10.0 ** -min(decimals(lo_s), 6)
    return project(la + rnd.uniform(-hla, hla), lo + rnd.uniform(-hlo, hlo))


def main(path):
    rnd = random.Random(SEED)
    pts, n, kinds = [], 0, {"station": 0, "dockless": 0}
    with open(path) as f:
        for row in csv.DictReader(f):
            n += 1
            p = spread(row, rnd)
            if p is None:
                continue
            x, y = p
            if x * x + y * y <= KEEP_M ** 2:
                pts.append((round(x, -1), round(y, -1)))
                kinds["station" if row["end_station_id"] else "dockless"] += 1
    sample = random.Random(SEED + 1).sample(pts, SAMPLE)
    out = {"_source": "Divvy system data 202404-divvy-tripdata.zip (trip ends), Divvy Data License Agreement; "
                      "local cache, not committed",
           "_hub_latlon": HUB, "_trips_in_file": n, "_ends_within_10km": len(pts), "_kinds": kinds,
           "_jitter_m": JITTER_M, "_keep_m": KEEP_M, "points_m": [[int(x), int(y)] for x, y in sample]}
    os.makedirs(os.path.dirname(out_path()), exist_ok=True)
    with open(out_path(), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("%d trips, %d ends within %.0f m (%s), wrote %d to %s"
          % (n, len(pts), KEEP_M, kinds, SAMPLE, out_path()))


if __name__ == "__main__":
    main(sys.argv[1])

"""Milestone 11j, data step: where New Yorkers live and where they work, on the 100 m grid around 11a's hub.

Sources (US Census Bureau, public domain, US government works):
  residents  2020 Census centers of population by block group, New York State:
             https://www2.census.gov/geo/docs/reference/cenpop2020/blkgrp/CenPop2020_Mean_BG36.txt
             (2020 population and the population-weighted mean lat/lon of each block group).
  jobs       LEHD Origin-Destination Employment Statistics (LODES 8), workplace area characteristics, all jobs
             (S000, JT00), 2022, column C000 (jobs located in the block):
             https://lehd.ces.census.gov/data/lodes/LODES8/ny/wac/ny_wac_S000_JT00_2022.csv.gz
             with the LODES 8 geography crosswalk for the block's internal point (blklatdd, blklondd):
             https://lehd.ces.census.gov/data/lodes/LODES8/ny/ny_xwalk.csv.gz

Only the five counties of New York City are kept (FIPS 36005, 36047, 36061, 36081, 36085), so New Jersey is absent,
as it is from the land mask (11i) and the city's ride-hail data. Each block group's population is put in the 100 m
cell of its population centroid; each block's jobs in the cell of its internal point. Projection and grid are 11i's
(land_extract.project; cell (i, j) covers [100 i, 100 i + 100) x [100 j, 100 j + 100)); cells whose centre is
farther than 10 km from the hub are dropped.

Output: nyc_demand_100m.json, {"pop": {"i,j": residents}, "jobs": {"i,j": jobs}} plus totals.

Usage: python3 demand_extract.py <CenPop2020_Mean_BG36.txt> <ny_wac_S000_JT00_2022.csv.gz> <ny_xwalk.csv.gz>
"""
import csv
import gzip
import importlib.util
import io
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_land_extract_11j", os.path.join(HERE, "land_extract.py"))
le = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(le)

NYC = {"36005", "36047", "36061", "36081", "36085"}
H, KEEP_M = le.H, le.KEEP_M


def cell_of(lat, lon, h=H, keep=KEEP_M):
    x, y = le.project(lat, lon)
    i, j = int(math.floor(x / h)), int(math.floor(y / h))
    if ((i + 0.5) * h) ** 2 + ((j + 0.5) * h) ** 2 > keep * keep:
        return None
    return i, j


def residents(path):
    out, total_nyc = {}, 0
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row["STATEFP"] + row["COUNTYFP"] not in NYC:
                continue
            p = int(row["POPULATION"])
            total_nyc += p
            c = cell_of(float(row["LATITUDE"]), float(row["LONGITUDE"]))
            if c and p:
                out[c] = out.get(c, 0) + p
    return out, total_nyc


def jobs(wac_path, xwalk_path):
    pts = {}
    with gzip.open(xwalk_path, "rt") as f:
        for row in csv.DictReader(f):
            if row["cty"] in NYC:
                pts[row["tabblk2020"]] = (float(row["blklatdd"]), float(row["blklondd"]))
    out, total_nyc, missing = {}, 0, 0
    with gzip.open(wac_path, "rt") as f:
        for row in csv.DictReader(f):
            g = row["w_geocode"]
            if g[:5] not in NYC:
                continue
            n = int(row["C000"])
            total_nyc += n
            if g not in pts:
                missing += n
                continue
            c = cell_of(*pts[g])
            if c and n:
                out[c] = out.get(c, 0) + n
    return out, total_nyc, missing


def main(pop_path, wac_path, xwalk_path):
    pop, pop_nyc = residents(pop_path)
    job, job_nyc, missing = jobs(wac_path, xwalk_path)
    key = lambda c: f"{c[0]},{c[1]}"
    out = {"_source": "US Census Bureau: 2020 block-group centers of population (CenPop2020_Mean_BG36); "
                      "LODES 8 WAC S000 JT00 2022 C000 with the LODES 8 crosswalk block internal points",
           "_hub_latlon": le.HUB, "_cell_m": H, "_keep_m": KEEP_M,
           "_pop_window": sum(pop.values()), "_pop_nyc": pop_nyc,
           "_jobs_window": sum(job.values()), "_jobs_nyc": job_nyc, "_jobs_unlocated": missing,
           "pop": {key(c): v for c, v in sorted(pop.items())},
           "jobs": {key(c): v for c, v in sorted(job.items())}}
    with open(os.path.join(HERE, "nyc_demand_100m.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"residents: {out['_pop_window']:,} of NYC's {pop_nyc:,} within {KEEP_M:.0f} m, in {len(pop)} cells")
    print(f"jobs:      {out['_jobs_window']:,} of NYC's {job_nyc:,} within {KEEP_M:.0f} m, in {len(job)} cells "
          f"({missing} jobs in blocks without a crosswalk point)")


if __name__ == "__main__":
    main(*sys.argv[1:4])

"""Milestone 11i, data step: a 100 m land mask of New York City around 11a's hub, from the city's shoreline-clipped
borough boundaries.

Source: NYC Department of City Planning, "Borough Boundaries (Clipped to Shoreline)" (nybb), BYTES of the BIG APPLE,
https://www.nyc.gov/site/planning/data-maps/open-data.page, NYC Open Data terms of use (free use). Read here from
the GeoJSON conversion (CRS84 lon/lat) in https://github.com/dwillis/nyc-maps, file boroughs.geojson, because the
proxy this run used refused nyc.gov and data.cityofnewyork.us. The polygons exclude the rivers, bays and harbour.
They cover New York City only: New Jersey land (Hoboken, Jersey City) is outside the mask, as it is outside the city's
ride-hail data.

Projection: 11a's (equirectangular about the hub 40.750 N, 73.9875 W, mean Earth radius). Cells: the 100 m grid
aligned to multiples of 100 m in that plane (the grid paper_weights.py integrates on), cell (i, j) covering
[100 i, 100 i + 100) x [100 j, 100 j + 100). A cell is land if its centre is inside a borough polygon (even-odd rule
over all rings, by scanline). Kept: land cells whose centre is within 10 km of the hub (the destination file's
window). Output: nyc_land_100m.json, rows j -> runs [i0, i1] (inclusive) of land cells, plus counts.

Usage: python3 land_extract.py <path to boroughs.geojson>
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HUB = (40.750, -73.9875)
R_EARTH = 6371008.8
KEEP_M = 10000.0
H = 100.0


def project(lat, lon):
    k = math.pi / 180 * R_EARTH
    return ((lon - HUB[1]) * k * math.cos(math.radians(HUB[0])), (lat - HUB[0]) * k)


def edges_of(geo):
    out = []
    for feat in geo["features"]:
        g = feat["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            for ring in poly:
                pts = [project(lat, lon) for lon, lat, *_ in ring]
                out += [(pts[k], pts[k + 1]) for k in range(len(pts) - 1)]
    return out


def rasterise(edges, h=H, keep=KEEP_M):
    n = int(math.ceil(keep / h))
    rows = {}
    for j in range(-n, n):
        yc = (j + 0.5) * h
        xs = sorted(x1 + (yc - y1) * (x2 - x1) / (y2 - y1) for (x1, y1), (x2, y2) in edges if (y1 > yc) != (y2 > yc))
        runs = []
        for a, b in zip(xs[0::2], xs[1::2]):
            i0, i1 = int(math.ceil(a / h - 0.5)), int(math.floor(b / h - 0.5))   # centres (i + 0.5) h in [a, b]
            i0, i1 = max(i0, -n), min(i1, n - 1)
            cells = [i for i in range(i0, i1 + 1) if ((i + 0.5) * h) ** 2 + yc * yc <= keep * keep]
            if cells:
                runs.append([cells[0], cells[-1]])
        if runs:
            rows[j] = runs
    return rows


def main(path):
    geo = json.load(open(path))
    rows = rasterise(edges_of(geo))
    n_land = sum(i1 - i0 + 1 for r in rows.values() for i0, i1 in r)
    out = {"_source": "NYC DCP Borough Boundaries (Clipped to Shoreline), via github.com/dwillis/nyc-maps boroughs.geojson",
           "_hub_latlon": HUB, "_cell_m": H, "_keep_m": KEEP_M, "_land_cells": n_land,
           "rows": {str(j): r for j, r in sorted(rows.items())}}
    with open(os.path.join(HERE, "nyc_land_100m.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{n_land} land cells of 100 m within {KEEP_M:.0f} m ({n_land * H * H / (math.pi * KEEP_M ** 2):.3f} of the disc)")


if __name__ == "__main__":
    main(sys.argv[1])

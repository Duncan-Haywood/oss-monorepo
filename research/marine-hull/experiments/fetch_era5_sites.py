"""Milestone 6x data: ERA5 wave reanalysis (swh, mwp) for January and July 2024 at the programme's 11 NDBC buoys, its five
corridor sites, and a 10 degree open-ocean grid.

6w found that ERA5 at the vehicle's position (0.5 degree wave grid, Open-Meteo `models=era5_ocean`) keeps 6u's speed
law U = s (Hs/T)^0.53 and gives the same monthly km/day plan as the vehicle's own wave sensor. 6x asks whether the plan
then transfers: at the buoys (where 6v already has a measured plan to compare) and in open ocean, where no buoy is.
Data: ERA5 (Hersbach et al. 2020, doi:10.1002/qj.3803) via the Open-Meteo marine API, licence CC BY 4.0, "Contains
modified Copernicus Climate Change Service information". Open-Meteo snaps each request to its nearest wave-grid point;
a land point returns nulls. For a buoy or site whose snapped point is null, the eight neighbours 0.5 degree away are
tried, nearest first.

Outputs:
  experiments/data/era5_sites_2024.csv: site, kind (buoy|corridor), lat, lon (grid point used), month, hour, hs, tm
  experiments/data/era5_grid_2024.csv: lat, lon, month, n, hs_med, tm_med, q01..q20 (the 2.5, 7.5, ..., 97.5th
    percentiles of q = hs / tm over the month's hours; 20 equal-mass bins, so a mean of f(q) is the mean over them)
Run: python3 experiments/fetch_era5_sites.py   (about 60 requests; the API's per-IP limit answers with an error now
and then, which is retried)"""
import csv
import json
import math
import time
import urllib.error
import urllib.request

D = "experiments/data/"
API = ("https://marine-api.open-meteo.com/v1/marine?latitude={lat}&longitude={lon}&hourly=wave_height,wave_period"
       "&start_date={a}&end_date={b}&models=era5_ocean&timezone=GMT")
MONTHS = {1: ("2024-01-01", "2024-01-31"), 7: ("2024-07-01", "2024-07-31")}
# NDBC station table positions, as experiments/fetch_ndbc_buoys.py (46042 has no 2024 wave file)
BUOYS = {"46026": (37.750, -122.838), "46013": (38.235, -123.317), "46011": (34.937, -120.999),
         "46054": (34.274, -120.468), "41009": (28.508, -80.185), "41010": (28.860, -78.478),
         "42036": (28.500, -84.505), "42040": (29.207, -88.237), "44025": (40.258, -73.175),
         "44013": (42.346, -70.651), "44009": (38.460, -74.692)}
# the programme's corridor sites (experiments/data/daily_<site>.json, milestone 5)
CORRIDOR = {"Equator-Pacific": (0.0, -90.0), "Florida-Straits": (25.0, -80.0), "Gulf-of-Maine": (42.0, -70.0),
            "North-Sea": (55.0, 5.0), "Gulf-of-Alaska": (60.0, -145.0)}
GRID = [(la, lo) for la in range(-70, 71, 10) for lo in range(-180, 180, 10)]


def get(url):
    for attempt in range(8):
        try:
            out = json.loads(urllib.request.urlopen(url, timeout=120).read().decode())
            if isinstance(out, dict) and out.get("error"):
                raise ValueError(out.get("reason"))
            return out
        except (urllib.error.URLError, ValueError, ConnectionError, OSError) as e:
            if attempt == 7:
                raise
            print("retry", e, flush=True)
            time.sleep(2 * 2 ** min(attempt, 4))


def fetch(points, month):
    """{point: (grid lat, grid lon, [(hour, hs, tm)])} for a list of (lat, lon)."""
    a, b = MONTHS[month]
    res = {}
    for i in range(0, len(points), 20):
        batch = points[i:i + 20]
        out = get(API.format(lat=",".join(str(p[0]) for p in batch), lon=",".join(str(p[1]) for p in batch), a=a, b=b))
        out = out if isinstance(out, list) else [out]
        for p, o in zip(batch, out):
            h = o["hourly"]
            rows = [(t[:13], hs, tm) for t, hs, tm in zip(h["time"], h["wave_height"], h["wave_period"])
                    if hs is not None and tm is not None and hs > 0 and tm > 0]
            res[p] = (o["latitude"], o["longitude"], rows)
    return res


def site_rows(name, kind, pos, month):
    cands = [pos] + sorted(((pos[0] + dy, pos[1] + dx) for dy in (-0.5, 0, 0.5) for dx in (-0.5, 0, 0.5)
                            if dy or dx), key=lambda p: math.hypot(p[0] - pos[0], p[1] - pos[1]))
    for c in cands:
        la, lo, rows = fetch([c], month)[c]
        if len(rows) >= 500:
            return [(name, kind, la, lo, month, t, hs, tm) for t, hs, tm in rows]
    print("no ERA5 waves near", name, month)
    return []


def quantiles(v, k=20):
    v = sorted(v)
    out = []
    for j in range(k):
        x = (j + 0.5) / k * (len(v) - 1)
        lo = int(x)
        out.append(v[lo] + (v[min(lo + 1, len(v) - 1)] - v[lo]) * (x - lo))
    return out


def main():
    with open(D + "era5_sites_2024.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["site", "kind", "lat", "lon", "month", "hour", "hs", "tm"])
        for m in MONTHS:
            for kind, tab in (("buoy", BUOYS), ("corridor", CORRIDOR)):
                for name, pos in tab.items():
                    rows = site_rows(name, kind, pos, m)
                    w.writerows(rows)
                    print(m, name, len(rows), rows[0][2:4] if rows else None, flush=True)
    with open(D + "era5_grid_2024.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["lat", "lon", "month", "n", "hs_med", "tm_med"] + [f"q{j + 1:02d}" for j in range(20)])
        for m in MONTHS:
            res = fetch(GRID, m)
            n = 0
            for p in GRID:
                la, lo, rows = res[p]
                if len(rows) < 600:
                    continue
                q = quantiles([hs / tm for _, hs, tm in rows])
                hs_m = sorted(r[1] for r in rows)[len(rows) // 2]
                tm_m = sorted(r[2] for r in rows)[len(rows) // 2]
                w.writerow([p[0], p[1], m, len(rows), hs_m, tm_m] + [f"{x:.5f}" for x in q])
                n += 1
            print(f"month {m}: {n} of {len(GRID)} grid points with ocean waves", flush=True)


if __name__ == "__main__":
    main()

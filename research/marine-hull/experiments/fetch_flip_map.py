"""Milestone 6z data: twelve months of 2024 ERA5 waves and NASA POWER daily insolation at the five corridor sites and
along two open-ocean meridians (150 W in the Pacific, 30 W in the Atlantic, 60 S to 60 N every 10 degrees).

Waves: ERA5 (Hersbach et al. 2020, doi:10.1002/qj.3803) via the Open-Meteo marine API (`models=era5_ocean`), licence
CC BY 4.0, "Contains modified Copernicus Climate Change Service information"; the same source and request as
fetch_era5_sites.py (6x). Open-Meteo snaps a request to its nearest 0.5 degree wave-grid point; a land point returns
nulls, and then the eight neighbours 0.5 degree away are tried, nearest first. Hours under sea ice are null in ERA5;
a point-month keeps its row only with at least 80% of its hours (the run reports what was dropped).
Sun: NASA POWER daily ALLSKY_SFC_SW_DWN (kWh/m2/day, community RE; the corridor sites' files are already on disk from
milestone 5, experiments/data/daily_<site>.json), public domain per NASA's data policy.

Outputs:
  experiments/data/era5_flip_2024.csv: point, lat, lon (grid point used), month, n, n_month, hs_med, tm_med,
    q01..q20 (the 2.5, 7.5, ..., 97.5th percentiles of q = hs / tm over the month's hours, as 6x's grid file)
  experiments/data/sun_flip_2024.json: {point: {"lat", "lon", "daily": {YYYYMMDD: kWh/m2/day}}} for the transect
Run: python3 experiments/fetch_flip_map.py   (about 70 requests, a few minutes; retried on the API's rate errors)"""
import calendar
import csv
import json
import math
import os
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "data") + os.sep
WAVE = ("https://marine-api.open-meteo.com/v1/marine?latitude={lat}&longitude={lon}&hourly=wave_height,wave_period"
        "&start_date=2024-01-01&end_date=2024-12-31&models=era5_ocean&timezone=GMT")
SUN = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=RE"
       "&longitude={lon}&latitude={lat}&start=20240101&end=20241231&format=JSON")
CORRIDOR = {"Equator-Pacific": (0.0, -90.0), "Florida-Straits": (25.0, -80.0), "Gulf-of-Maine": (42.0, -70.0),
            "North-Sea": (55.0, 5.0), "Gulf-of-Alaska": (60.0, -145.0)}
MERIDIANS = {"P": -150.0, "A": -30.0}
LATS = tuple(range(-60, 61, 10))
TRANSECT = {f"{k}{la:+d}": (float(la), lon) for k, lon in MERIDIANS.items() for la in LATS}


def get(url):
    for attempt in range(8):
        try:
            out = json.loads(urllib.request.urlopen(url, timeout=180).read().decode())
            if isinstance(out, dict) and out.get("error"):
                raise ValueError(out.get("reason"))
            return out
        except (urllib.error.URLError, ValueError, ConnectionError, OSError) as e:
            if attempt == 7:
                raise
            print("retry", e, flush=True)
            time.sleep(2 * 2 ** min(attempt, 4))


def year_waves(pos):
    o = get(WAVE.format(lat=pos[0], lon=pos[1]))
    h = o["hourly"]
    rows = [(t, hs, tm) for t, hs, tm in zip(h["time"], h["wave_height"], h["wave_period"])
            if hs is not None and tm is not None and hs > 0 and tm > 0]
    return o["latitude"], o["longitude"], rows


def point_waves(pos):
    cands = [pos] + sorted(((pos[0] + dy, pos[1] + dx) for dy in (-0.5, 0, 0.5) for dx in (-0.5, 0, 0.5)
                            if dy or dx), key=lambda p: math.hypot(p[0] - pos[0], p[1] - pos[1]))
    for c in cands:
        la, lo, rows = year_waves(c)
        if len(rows) >= 2000:
            return la, lo, rows
    return None


def quantiles(v, k=20):
    v = sorted(v)
    out = []
    for j in range(k):
        x = (j + 0.5) / k * (len(v) - 1)
        lo = int(x)
        out.append(v[lo] + (v[min(lo + 1, len(v) - 1)] - v[lo]) * (x - lo))
    return out


def main():
    pts = dict(CORRIDOR)
    pts.update(TRANSECT)
    with open(D + "era5_flip_2024.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["point", "lat", "lon", "month", "n", "n_month", "hs_med", "tm_med"]
                   + [f"q{j + 1:02d}" for j in range(20)])
        for name, pos in pts.items():
            got = point_waves(pos)
            if got is None:
                print("no ERA5 waves near", name, pos, flush=True)
                continue
            la, lo, rows = got
            kept = 0
            for m in range(1, 13):
                mr = [r for r in rows if int(r[0][5:7]) == m]
                n_month = 24 * calendar.monthrange(2024, m)[1]
                if len(mr) < 0.8 * n_month:
                    continue
                hs = sorted(r[1] for r in mr)
                tm = sorted(r[2] for r in mr)
                q = quantiles([r[1] / r[2] for r in mr])
                w.writerow([name, la, lo, m, len(mr), n_month, hs[len(hs) // 2], tm[len(tm) // 2]]
                           + [f"{x:.5f}" for x in q])
                kept += 1
            print(name, (la, lo), len(rows), "hours,", kept, "months kept", flush=True)
    sun = {}
    for name, pos in TRANSECT.items():
        o = get(SUN.format(lat=pos[0], lon=pos[1]))
        p = o["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
        sun[name] = {"lat": pos[0], "lon": pos[1], "daily": p}
        print(name, "sun", len(p), "days, min", min(p.values()), flush=True)
    with open(D + "sun_flip_2024.json", "w") as f:
        json.dump(sun, f, separators=(",", ":"), sort_keys=True)


if __name__ == "__main__":
    main()

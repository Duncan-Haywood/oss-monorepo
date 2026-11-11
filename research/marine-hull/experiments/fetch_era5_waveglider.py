"""Milestone 6w data: ERA5 wave reanalysis at the Honey Badger Wave Glider's hourly position, 20 May to 4 Nov 2015.

6u found the vehicle's speed follows its own on-board heave velocity, U ~ (Hs/T_avg)^0.53, and that an *oracle*
on-board Hs and period (the observed target-hour values) cut the 24 h persistence error by a quarter (H3). A planner
has no on-board record of the future, and away from a buoy has only a model. ERA5 (ECMWF's reanalysis; Hersbach et al.
2020, doi:10.1002/qj.3803) carries significant wave height (swh), mean wave period (mwp, from the m-1 moment) and peak
period (pp1d) on a 0.5 degree wave grid, hourly. Open-Meteo's marine API serves it (`models=era5_ocean`) without an
account; data licence CC BY 4.0, "Contains modified Copernicus Climate Change Service information".

Each hour's position comes from experiments/data/waveglider_hourly.csv (6p's telemetry fetch). Positions are snapped
to the nearest 0.5 degree point; one request per batch of points covers the whole mission.
Output: experiments/data/era5_waveglider_hourly.csv: hour, lat, lon (grid point), hs, tm (mwp), tp (pp1d).
Run: python3 experiments/fetch_era5_waveglider.py   (109 grid points, about a minute)"""
import csv
import json
import time
import urllib.error
import urllib.request

D = "experiments/data/"
API = ("https://marine-api.open-meteo.com/v1/marine?latitude={lat}&longitude={lon}"
       "&hourly=wave_height,wave_period,wave_peak_period&start_date=2015-05-20&end_date=2015-11-04"
       "&models=era5_ocean&timezone=GMT")


def snap(x):
    return round(x * 2) / 2


def get(url):
    for attempt in range(5):
        try:
            return json.loads(urllib.request.urlopen(url, timeout=120).read().decode())
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            if attempt == 4:
                raise
            print("retry", e)
            time.sleep(3 * 2 ** attempt)


def main():
    rows = list(csv.DictReader(open(D + "waveglider_hourly.csv")))
    cell = {r["hour"]: (snap(float(r["lat"])), snap(float(r["lon"]))) for r in rows}
    pts = sorted(set(cell.values()))
    grid = {}
    for i in range(0, len(pts), 20):
        batch = pts[i:i + 20]
        out = get(API.format(lat=",".join(str(p[0]) for p in batch), lon=",".join(str(p[1]) for p in batch)))
        out = out if isinstance(out, list) else [out]
        for p, o in zip(batch, out):
            h = o["hourly"]
            grid[p] = {t[:13]: (hs, tm, tp) for t, hs, tm, tp in
                       zip(h["time"], h["wave_height"], h["wave_period"], h["wave_peak_period"])}
        print(f"{min(i + 20, len(pts))}/{len(pts)} grid points")
    with open(D + "era5_waveglider_hourly.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["hour", "lat", "lon", "hs", "tm", "tp"])
        n = 0
        for r in rows:
            p = cell[r["hour"]]
            v = grid[p].get(r["hour"])
            if v and None not in v:
                w.writerow([r["hour"], p[0], p[1], v[0], v[1], v[2]])
                n += 1
    print(f"{n} of {len(rows)} hours with ERA5 waves")


if __name__ == "__main__":
    main()

"""Milestone 6zk data: NASA POWER daily all-sky surface shortwave (ALLSKY_SFC_SW_DWN, kWh/m2/day, community RE) for
2015 to 2023 at the 25 transect points 6z and 6zj use (150 W and 30 W, 60 S to 60 N every 10 degrees, A-60 left out as
in 6zj). 2024 stays in 6z's committed experiments/data/sun_flip_2024.json; the five corridor sites already have
2015 to 2024 in milestone 5's experiments/data/daily_<site>.json. NASA POWER data are public domain per NASA's data
policy (Stackhouse et al., POWER project, https://power.larc.nasa.gov/).

Output: experiments/data/sun_transect_2015_2023.json
  {point: {"lat", "lon", "start": "20150101", "values": [kWh/m2/day, one per day in date order, 2 decimals]}}
Run: python3 experiments/fetch_sun_years.py   (25 requests, under a minute)"""
import datetime
import json
import os
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "sun_transect_2015_2023.json")
SUN = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=RE"
       "&longitude={lon}&latitude={lat}&start=20150101&end=20231231&format=JSON")
MERIDIANS = {"P": -150.0, "A": -30.0}
LATS = tuple(range(-60, 61, 10))
POINTS = {f"{k}{la:+d}": (float(la), lon) for k, lon in MERIDIANS.items() for la in LATS if f"{k}{la:+d}" != "A-60"}


def get(url):
    for attempt in range(6):
        try:
            return json.loads(urllib.request.urlopen(url, timeout=180).read().decode())
        except (urllib.error.URLError, ValueError, ConnectionError, OSError) as e:
            if attempt == 5:
                raise
            print("retry", e, flush=True)
            time.sleep(2 * 2 ** attempt)


def main():
    out = {}
    n_days = (datetime.date(2023, 12, 31) - datetime.date(2015, 1, 1)).days + 1
    for p, (lat, lon) in POINTS.items():
        d = get(SUN.format(lat=lat, lon=lon))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
        keys = sorted(d)
        assert len(keys) == n_days and keys[0] == "20150101" and keys[-1] == "20231231", (p, len(keys))
        vals = [round(d[k], 2) for k in keys]
        fill = sum(v < 0 for v in vals)
        print(f"{p}: {len(vals)} days, {fill} fill values", flush=True)
        out[p] = {"lat": lat, "lon": lon, "start": "20150101", "values": vals}
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()

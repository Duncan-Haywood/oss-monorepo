"""Milestone 6zzze data: NASA POWER daily all-sky surface shortwave (ALLSKY_SFC_SW_DWN, kWh/m2/day, community RE)
for 2025 at the 30 points every milestone since 6zk scores (25 transect points, 60 S to 60 N every 10 degrees on
150 W and 30 W, A-60 left out, plus the five corridor sites). 2025 is a year no milestone has read: the rules were
fixed on 2005 to 2014 scored against a 2015 to 2024 climatology. NASA POWER data are public domain per NASA's data
policy (Stackhouse et al., POWER project, https://power.larc.nasa.gov/). Fetched 2026-11-17; the full year was
published with no fill values at the probe point.

Output: experiments/data/sun_30pts_2025.json
  {point: {"lat", "lon", "start": "20250101", "values": [kWh/m2/day, one per day in date order, 2 decimals]}}
Run: python3 experiments/fetch_sun_2025.py   (30 requests, about a minute)"""
import json
import os
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "sun_30pts_2025.json")
SUN = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=RE"
       "&longitude={lon}&latitude={lat}&start=20250101&end=20251231&format=JSON")
MERIDIANS = {"P": -150.0, "A": -30.0}
POINTS = {f"{k}{la:+d}": (float(la), lon) for k, lon in MERIDIANS.items() for la in range(-60, 61, 10)
          if f"{k}{la:+d}" != "A-60"}
POINTS.update({"Equator-Pacific": (0.0, -90.0), "Florida-Straits": (25.0, -80.0), "Gulf-of-Maine": (42.0, -70.0),
               "North-Sea": (55.0, 5.0), "Gulf-of-Alaska": (60.0, -145.0)})


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
    for p, (lat, lon) in POINTS.items():
        d = get(SUN.format(lat=lat, lon=lon))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
        keys = sorted(d)
        assert len(keys) == 365 and keys[0] == "20250101" and keys[-1] == "20251231", (p, len(keys))
        vals = [round(d[k], 2) for k in keys]
        print(f"{p}: {len(vals)} days, {sum(v < 0 for v in vals)} fill values", flush=True)
        out[p] = {"lat": lat, "lon": lon, "start": "20250101", "values": vals}
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()

"""Milestone 6zx data: NASA POWER daily all-sky surface shortwave (ALLSKY_SFC_SW_DWN, kWh/m2/day, community RE) for
2005 to 2014 at the 30 points 6zk to 6zw use: the 25 transect points (150 W and 30 W, 60 S to 60 N every 10 degrees,
A-60 left out) and the five corridor sites of milestone 5 (same coordinates as experiments/data/daily_<site>.json).
These ten years are new to the programme: no earlier milestone read them, so 6zx can test 6zv's feedback-time table
and 6zw's adaptive rule with both frozen. NASA POWER data are public domain per NASA's data policy (Stackhouse et
al., POWER project, https://power.larc.nasa.gov/).

Output: experiments/data/sun_30pts_2005_2014.json
  {point: {"lat", "lon", "start": "20050101", "values": [kWh/m2/day, one per day in date order, 2 decimals]}}
Run: python3 experiments/fetch_sun_2005_2014.py   (30 requests, about a minute)"""
import datetime
import json
import os
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "sun_30pts_2005_2014.json")
START, END = "20050101", "20141231"
SUN = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=RE"
       "&longitude={lon}&latitude={lat}&start=" + START + "&end=" + END + "&format=JSON")
MERIDIANS = {"P": -150.0, "A": -30.0}
LATS = tuple(range(-60, 61, 10))
POINTS = {f"{k}{la:+d}": (float(la), lon) for k, lon in MERIDIANS.items() for la in LATS if f"{k}{la:+d}" != "A-60"}
CORRIDOR = ("Equator-Pacific", "Florida-Straits", "Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska")


def corridor_points():
    out = {}
    for s in CORRIDOR:
        lon, lat = json.load(open(os.path.join(HERE, "data", f"daily_{s}.json")))["geometry"]["coordinates"][:2]
        out[s] = (float(lat), float(lon))
    return out


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
    pts = dict(POINTS)
    pts.update(corridor_points())
    out = {}
    n_days = (datetime.date(2014, 12, 31) - datetime.date(2005, 1, 1)).days + 1
    for p, (lat, lon) in pts.items():
        d = get(SUN.format(lat=lat, lon=lon))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
        keys = sorted(d)
        assert len(keys) == n_days and keys[0] == START and keys[-1] == END, (p, len(keys))
        vals = [round(d[k], 2) for k in keys]
        fill = sum(v < 0 for v in vals)
        print(f"{p}: {len(vals)} days, {fill} fill values", flush=True)
        out[p] = {"lat": lat, "lon": lon, "start": START, "values": vals}
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()

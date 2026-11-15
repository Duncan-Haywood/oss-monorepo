"""Milestone 6zzm data: ERA5 daily surface shortwave radiation (shortwave_radiation_sum, MJ/m2/day) for 2005 to 2024 at
the nine high-amplitude points of 6zza (the same coordinates as the NASA POWER series the programme uses), as an
independent check on whether the NASA POWER months that make the lag-3 learning years (2007 and 2012) fail are real
weather or an artefact of the satellite product.

Data: ERA5 (Hersbach et al. 2020, doi:10.1002/qj.3803) via the Open-Meteo historical weather API
(https://open-meteo.com/en/docs/historical-weather-api, `models=era5`), licence CC BY 4.0, "Contains modified
Copernicus Climate Change Service information". ERA5 is a reanalysis (model radiation constrained by assimilated
observations); NASA POWER's ALLSKY_SFC_SW_DWN comes from satellite retrievals (CERES / GEWEX SRB), so the two are
independent estimates of the same quantity, not two copies of one record.

Output: experiments/data/era5_sun_hiamp_2005_2024.json
  {point: {"lat", "lon", "start": "2005-01-01", "values": [MJ/m2/day, one per day in date order]}}
Run: python3 experiments/fetch_era5_sun.py   (9 requests)"""
import json
import os
import time
import urllib.error
import urllib.request

import fetch_sun_2005_2014 as fs

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "era5_sun_hiamp_2005_2024.json")
HI = ("P-60", "P-30", "P+50", "P+60", "A-50", "A+50", "A+60", "North-Sea", "Gulf-of-Alaska")
API = ("https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date=2005-01-01"
       "&end_date=2024-12-31&daily=shortwave_radiation_sum&models=era5&timezone=GMT")
N_DAYS = 7305  # 2005-01-01 to 2024-12-31


def coords():
    pts = dict(fs.POINTS)
    pts.update(fs.corridor_points())
    return {p: pts[p] for p in HI}


def get(url):
    for attempt in range(6):
        try:
            return json.loads(urllib.request.urlopen(url, timeout=180).read().decode())
        except (urllib.error.URLError, ValueError, ConnectionError, OSError) as e:
            if attempt == 5:
                raise
            print("retry", e, flush=True)
            time.sleep(5 * 2 ** attempt)


def main():
    out = {}
    for p, (lat, lon) in coords().items():
        d = get(API.format(lat=lat, lon=lon))["daily"]
        vals = d["shortwave_radiation_sum"]
        assert len(vals) == N_DAYS and d["time"][0] == "2005-01-01", (p, len(vals))
        assert all(v is not None for v in vals), p
        print(f"{p}: {len(vals)} days", flush=True)
        out[p] = {"lat": lat, "lon": lon, "start": "2005-01-01", "values": vals}
        time.sleep(2)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()

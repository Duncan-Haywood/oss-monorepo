"""Fetch hourly 2 m air temperature for five large German cities from Open-Meteo's ERA5 archive (CC BY 4.0) and write
temp<year>.csv: the population-weighted mean (utc, temp_c), first 8,760 hours, aligned with ../../energy-thermal-real/data.
Weights are rounded city populations (millions, ~2015), a choice of this project, not a census-weighted national mean."""
import csv
import json
import subprocess
import time
from pathlib import Path

CITIES = {"Berlin": (52.52, 13.41, 3.6), "Hamburg": (53.55, 9.99, 1.8), "Munich": (48.14, 11.58, 1.5),
          "Cologne": (50.94, 6.96, 1.1), "Frankfurt": (50.11, 8.68, 0.7)}
OUT = Path(__file__).resolve().parent

def get(url, tries=8):
    """curl with retries: the sandbox proxy drops some TLS handshakes."""
    for k in range(tries):
        r = subprocess.run(["curl", "-sS", "--fail", url], capture_output=True)
        if r.returncode == 0:
            return json.loads(r.stdout)["hourly"]
        time.sleep(2 * (k + 1))
    raise RuntimeError(url)


for year in range(2015, 2020):
    cols, wsum = [], sum(w for *_, w in CITIES.values())
    for lat, lon, w in CITIES.values():
        url = (f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date={year}-01-01"
               f"&end_date={year}-12-31&hourly=temperature_2m&timezone=GMT")
        d = get(url)
        cols.append([w * t / wsum for t in d["temperature_2m"][:8760]])
        times = d["time"][:8760]
    with open(OUT / f"temp{year}.csv", "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["utc", "temp_c"])
        for i, t in enumerate(times):
            wr.writerow([t, round(sum(c[i] for c in cols), 2)])

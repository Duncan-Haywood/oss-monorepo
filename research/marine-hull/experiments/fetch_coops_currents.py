"""Fetch NOAA CO-OPS (PORTS) observed currents for the stations in the `currents` list, Jan 2024, into
experiments/data/coops_currents.csv: per station, the speed (m/s; median over depth bins at each 6-minute reading)
at percentiles 0, 5, ..., 100. The raw series is 35 MB so only this summary is kept. Needs network; run once.
Run: python3 experiments/fetch_coops_currents.py"""
import csv, json, statistics, time, urllib.request
BASE = "https://api.tidesandcurrents.noaa.gov"
def get(u):
    for i in range(3):
        try:
            return urllib.request.urlopen(u, timeout=60).read().decode()
        except Exception:
            time.sleep(2 * (i + 1))
    return ""
st = json.loads(get(f"{BASE}/mdapi/prod/webapi/stations.json?type=currents&units=metric"))["stations"]
rows = []
PCT = list(range(0, 101, 5))
def summarise(v):
    v = sorted(v)
    return [round(v[min(len(v) - 1, int(round(p / 100 * (len(v) - 1))))], 4) for p in PCT]
for s in st:
    t = get(f"{BASE}/api/prod/datagetter?begin_date=20240101&end_date=20240131&station={s['id']}&product=currents"
            f"&time_zone=gmt&units=metric&format=csv&application=oss-monorepo-research")
    by = {}
    for line in t.splitlines()[1:]:
        p = line.split(",")
        try:
            x = float(p[1]) / 100
        except (ValueError, IndexError):
            continue
        by.setdefault(p[0], []).append(x)
    sp = [statistics.median(v) for v in by.values()]
    if len(sp) >= 1000:
        rows.append((s["id"], s["name"], s["lat"], s["lng"], len(sp), *summarise(sp)))
    print(s["id"], len(by), flush=True)
with open("experiments/data/coops_currents.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["station", "name", "lat", "lon", "n_readings"] + [f"p{p}" for p in PCT]); w.writerows(rows)

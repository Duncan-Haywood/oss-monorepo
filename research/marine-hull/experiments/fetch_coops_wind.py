"""Fetch NOAA CO-OPS observed wind (6-minute speed m/s and direction-from deg) at coastal stations, Jan and Jul 2024,
into experiments/data/coops_wind_<station>_<yyyymm>.csv (columns t_min, speed, dir). Needs network; run once.
Run: python3 experiments/fetch_coops_wind.py"""
import time, urllib.request
BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
STATIONS = {"9414290": "San Francisco", "8723214": "Virginia Key FL", "8729840": "Pensacola", "8454000": "Providence", "8575512": "Annapolis",
            "8771450": "Galveston Pier 21", "9413450": "Monterey", "8461490": "New London", "9414750": "Alameda", "8516945": "Kings Point NY",
            "8735180": "Dauphin Island", "8670870": "Fort Pulaski", "8761724": "Grand Isle", "9419750": "Crescent City", "8557380": "Lewes DE"}
MONTHS = {"202401": ("20240101", "20240131"), "202407": ("20240701", "20240731")}
def get(u):
    for i in range(3):
        try:
            return urllib.request.urlopen(u, timeout=60).read().decode()
        except Exception:
            time.sleep(2 * (i + 1))
    return ""
for sid in STATIONS:
    for ym, (b, e) in MONTHS.items():
        t = get(f"{BASE}?product=wind&station={sid}&begin_date={b}&end_date={e}&units=metric&time_zone=gmt&format=csv&application=oss-monorepo-research")
        rows, n = [], 0
        for line in t.splitlines()[1:]:
            p = line.split(",")
            try:
                rows.append((n * 6, float(p[1]), float(p[2])))
            except (ValueError, IndexError):
                rows.append((n * 6, "", ""))
            n += 1
        ok = sum(1 for r in rows if r[1] != "")
        print(sid, STATIONS[sid], ym, len(rows), ok, flush=True)
        if ok > 0.9 * 31 * 240 * 0.9:
            with open(f"experiments/data/coops_wind_{sid}_{ym}.csv", "w") as f:
                f.write("t_min,speed,dir\n"); f.writelines(f"{a},{b_},{c}\n" for a, b_, c in rows)

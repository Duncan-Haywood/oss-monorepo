"""Milestone 5k: open-water buoy winds. Fetch NDBC historical standard-meteorological files (10-minute WDIR/WSPD) for 12 buoys, Jan and Jul 2024,
write experiments/data/ndbc_wind_<id>_<yyyymm>.csv (t_min, speed m/s, dir deg from, same layout as the CO-OPS files of 5a), and the archived
HRRR 10 m wind at the nearest 3 km cell to each buoy (same cycles, latency and forecast hours as fetch_hrrr_wind.py, 5h) into
experiments/data/hrrr_buoy_<yyyymm>.csv. Buoy positions are from NDBC station_table.txt (read this session).
Run: PYTHONPATH=experiments python3 experiments/fetch_ndbc_buoys.py   (needs eccodes, numpy)"""
import csv, gzip, io, urllib.request, concurrent.futures as cf, datetime as dt
import fetch_hrrr_wind as F

BUOYS = {"46026": (37.750, -122.838), "46013": (38.235, -123.317), "46042": (36.787, -122.408), "46011": (34.937, -120.999),
         "46054": (34.274, -120.468), "41009": (28.508, -80.185), "41010": (28.860, -78.478), "42036": (28.500, -84.505),
         "42040": (29.207, -88.237), "44025": (40.258, -73.175), "44013": (42.346, -70.651), "44009": (38.460, -74.692)}
MONTHS = {"202401": (2024, 1), "202407": (2024, 7)}

def ndbc():
    """Skips a buoy whose 2024 file is missing (404) and a buoy-month with under 1,000 valid 10-minute records."""
    ok = {}
    for b in list(BUOYS):
        try:
            raw = urllib.request.urlopen(f"https://www.ndbc.noaa.gov/data/historical/stdmet/{b}h2024.txt.gz", timeout=60).read()
        except Exception as e:
            print(b, "no file", e, flush=True); del BUOYS[b]; continue
        rows = gzip.decompress(raw).decode().splitlines()[2:]
        for ym, (y, m) in MONTHS.items():
            t0 = dt.datetime(y, m, 1)
            out = []
            for ln in rows:
                p = ln.split()
                if int(p[1]) != m: continue
                spd, dr = float(p[6]), float(p[5])
                if spd >= 98 or dr >= 361: continue
                t = (dt.datetime(int(p[0]), m, int(p[2]), int(p[3]), int(p[4])) - t0).total_seconds() / 60
                out.append((int(t), spd, dr))
            print(b, ym, len(out), flush=True)
            if len(out) < 1000: continue
            with open(f"experiments/data/ndbc_wind_{b}_{ym}.csv", "w", newline="") as f:
                w = csv.writer(f); w.writerow(["t_min", "speed", "dir"]); w.writerows(out)

def hrrr():
    F.ST.clear(); F.ST.update(BUOYS)
    for ym, (y, m) in MONTHS.items():
        jobs = set()
        for d in range(0, 31, F.EVERY):
            jobs |= F.jobs_for(dt.datetime(y, m, 1 + d))
        jobs = sorted(jobs); rows = []
        print(ym, len(jobs), "files", flush=True)
        with cf.ThreadPoolExecutor(8) as ex:
            for n, (job, res) in enumerate(ex.map(F.one, jobs)):
                if res is None: print("missing", job, flush=True); continue
                for s in BUOYS: rows.append((s, f"{job[0]}{job[1]:02d}", job[2], res["UGRD"][s], res["VGRD"][s]))
                if n % 50 == 0: print(n, flush=True)
        with open(f"experiments/data/hrrr_buoy_{ym}.csv", "w", newline="") as f:
            w = csv.writer(f); w.writerow(["station", "cycle", "fhr", "u", "v"]); w.writerows(rows)
    la, lo = F.IDX["lat"], F.IDX["lon"]
    with open("experiments/data/hrrr_buoy_cells.csv", "w") as f:
        f.write("station,lat,lon,cell_lat,cell_lon\n")
        for s, i in F.IDX["i"].items():
            f.write(f"{s},{BUOYS[s][0]},{BUOYS[s][1]},{la[i]:.4f},{lo[i] - (360 if lo[i] > 180 else 0):.4f}\n")

if __name__ == "__main__":
    ndbc(); hrrr()

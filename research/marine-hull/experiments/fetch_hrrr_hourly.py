"""Milestone 5n: fetch archived HRRR 10 m wind from EVERY hourly cycle (not only 00/06/12/18z) at the NDBC buoys of 5k, so the replan can use a
cycle issued 1 h before (latency L=1) as well as 3 h before (L=3, the 5k setting, but on hourly cycles). Hourly non-synoptic cycles run to fhr 18 only,
so forecast hours are 0,1,2,3,4,6,9,12,18 (denser early, where the short-latency question lives); beyond fhr 18 the runner holds the last value.
Same windows as 5k (every 4th day of Jan and Jul 2024), same buoys (those with an ndbc_wind_*.csv), same nearest-cell rule.
Output: experiments/data/hrrr_buoyh_<yyyymm>.csv (station, cycle yyyymmddhh, fhr, u, v).
Run: PYTHONPATH=experiments python3 experiments/fetch_hrrr_hourly.py   (needs eccodes, numpy; about 3,900 files, ~1 GB of byte ranges)"""
import csv, glob, os, datetime as dt, concurrent.futures as cf
import fetch_hrrr_wind as F
import fetch_ndbc_buoys as N

FH = [0, 1, 2, 3, 4, 6, 9, 12, 18]
LATS = (1, 3)

def jobs_for_hourly(day0):
    jobs = set()
    for H in range(24):
        for L in LATS:
            t = day0 + dt.timedelta(hours=H - L)
            cyc = t.replace(minute=0)
            for f in FH:
                jobs.add((cyc.strftime("%Y%m%d"), cyc.hour, f))
    return jobs

def main():
    have = {os.path.basename(p).split("_")[2] for p in glob.glob("experiments/data/ndbc_wind_*.csv")}
    F.ST.clear(); F.ST.update({b: v for b, v in N.BUOYS.items() if b in have})
    for ym, (y, m) in N.MONTHS.items():
        jobs = set()
        for d in range(0, 31, F.EVERY):
            jobs |= jobs_for_hourly(dt.datetime(y, m, 1 + d))
        jobs = sorted(jobs); rows = []
        print(ym, len(jobs), "files", flush=True)
        with cf.ThreadPoolExecutor(12) as ex:
            for n, (job, res) in enumerate(ex.map(F.one, jobs)):
                if res is None: print("missing", job, flush=True); continue
                for s in F.ST: rows.append((s, f"{job[0]}{job[1]:02d}", job[2], res["UGRD"][s], res["VGRD"][s]))
                if n % 100 == 0: print(n, flush=True)
        with open(f"experiments/data/hrrr_buoyh_{ym}.csv", "w", newline="") as f:
            w = csv.writer(f); w.writerow(["station", "cycle", "fhr", "u", "v"]); w.writerows(rows)

if __name__ == "__main__":
    main()

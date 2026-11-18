"""Milestone 5h: fetch archived HRRR 10 m wind forecasts (NOAA open-data bucket noaa-hrrr-bdp-pds, GRIB2 byte ranges via the .idx)
at the CO-OPS wind stations of 5a, for every 4th day (the windows of 5d) of Jan and Jul 2024.
For a replan at UTC hour H the controller may use the newest long cycle (00, 06, 12, 18z) issued at least LAT=3 h before H
(HRRR long cycles run to 48 h; the 3 h is an assumed delivery latency). Forecast hours are fetched every 2 h and interpolated.
Station coordinates are the published CO-OPS values as recalled to 0.01 deg (the metadata API did not answer this session);
the nearest HRRR cell (3 km) does not move for an error of that size except at coasts. Output: experiments/data/hrrr_<yyyymm>.csv
(station, cycle yyyymmddhh, fhr, u, v in m/s, grid lat, grid lon).
Run: python3 experiments/fetch_hrrr_wind.py   (needs: pip install eccodes numpy; about 3.5 GB downloaded, a few minutes)"""
import datetime as dt, sys, urllib.request, concurrent.futures as cf, csv, os
import numpy as np, eccodes

ST = {"9414290": (37.81, -122.47), "8723214": (25.73, -80.16), "8729840": (30.40, -87.21), "8454000": (41.81, -71.40),
      "8575512": (38.98, -76.48), "8771450": (29.31, -94.79), "8516945": (40.81, -73.76), "8735180": (30.25, -88.08),
      "8670870": (32.03, -80.90), "8761724": (29.26, -89.96), "9419750": (41.75, -124.18), "8557380": (38.78, -75.12),
      "9414750": (37.77, -122.30)}
BASE = "https://noaa-hrrr-bdp-pds.s3.amazonaws.com/hrrr.{d}/conus/hrrr.t{c:02d}z.wrfsfcf{f:02d}.grib2"
LAT, STRIDE, EVERY = 3, 2, 4
IDX = {}

def get(url, rng=None):
    for i in range(4):
        try:
            rq = urllib.request.Request(url, headers={"Range": f"bytes={rng}"} if rng else {})
            return urllib.request.urlopen(rq, timeout=90).read()
        except Exception:
            import time; time.sleep(2 * (i + 1))
    return None

def cell_index(msg):
    lats, lons = eccodes.codes_get_array(msg, "latitudes"), eccodes.codes_get_array(msg, "longitudes")
    lons = np.where(lons > 180, lons - 360, lons)
    out = {}
    for s, (la, lo) in ST.items():
        d = (lats - la) ** 2 + ((lons - lo) * np.cos(np.radians(la))) ** 2
        out[s] = int(np.argmin(d))
    return out, lats, lons

def one(job):
    day, cyc, fhr = job
    url = BASE.format(d=day, c=cyc, f=fhr)
    idx = get(url + ".idx")
    if idx is None:
        return job, None
    lines = idx.decode().splitlines()
    got = {}
    for k, ln in enumerate(lines):
        p = ln.split(":")
        if len(p) > 4 and p[3] in ("UGRD", "VGRD") and p[4] == "10 m above ground":
            a = int(p[1]); b = int(lines[k + 1].split(":")[1]) - 1
            got[p[3]] = get(url, f"{a}-{b}")
    if len(got) != 2 or None in got.values():
        return job, None
    res = {}
    for nm, buf in got.items():
        msg = eccodes.codes_new_from_message(buf)
        if not IDX:
            IDX["i"], IDX["lat"], IDX["lon"] = cell_index(msg)
        v = eccodes.codes_get_values(msg)
        res[nm] = {s: float(v[i]) for s, i in IDX["i"].items()}
        eccodes.codes_release(msg)
    return job, res

def jobs_for(day0):
    jobs = set()
    for H in range(24):
        t = day0 + dt.timedelta(hours=H - LAT)
        cyc = t.replace(hour=(t.hour // 6) * 6)
        vs = list(range(H, 25, STRIDE)) + ([24] if (24 - H) % STRIDE else [])
        for vh in vs:
            f = int((day0 + dt.timedelta(hours=vh) - cyc).total_seconds() // 3600)
            jobs.add((cyc.strftime("%Y%m%d"), cyc.hour, f))
    return jobs

def main():
    for ym, (y, m) in (("202401", (2024, 1)), ("202407", (2024, 7))):
        jobs = set()
        for d in range(0, 31, EVERY):
            jobs |= jobs_for(dt.datetime(y, m, 1 + d))
        jobs = sorted(jobs)
        print(ym, len(jobs), "files", flush=True)
        rows = []
        with cf.ThreadPoolExecutor(8) as ex:
            for n, (job, res) in enumerate(ex.map(one, jobs)):
                if res is None:
                    print("missing", job, flush=True); continue
                for s in ST:
                    rows.append((s, f"{job[0]}{job[1]:02d}", job[2], res["UGRD"][s], res["VGRD"][s]))
                if n % 50 == 0: print(n, flush=True)
        with open(f"experiments/data/hrrr_{ym}.csv", "w", newline="") as f:
            w = csv.writer(f); w.writerow(["station", "cycle", "fhr", "u", "v"]); w.writerows(rows)
    la, lo = IDX["lat"], IDX["lon"]
    with open("experiments/data/hrrr_cells.csv", "w") as f:
        f.write("station,lat,lon,cell_lat,cell_lon\n")
        for s, i in IDX["i"].items():
            f.write(f"{s},{ST[s][0]},{ST[s][1]},{la[i]:.4f},{lo[i] - (360 if lo[i] > 180 else 0):.4f}\n")

if __name__ == "__main__":
    main()

"""Milestone 6t: a drift-aware central estimate between 6r's floor and ceiling. Same buoys, corridor lines and 86 km/day solar
ceiling as 6r. Winds >= 4 m/s use 6n's drone (0.90 m2, hull 1.20); winds < 4 m/s use the sail-only drone fitted in 6s with a
0.48 m/s drift in the model (0.68 m2, hull 4.05), so drift is not credited as sail distance. Reported beside 6r's ceiling (6n drone
everywhere) and floor (zero below 4 m/s).
Run: PYTHONPATH=src python3 experiments/run_wind_vs_sun_drift.py > experiments/results_wind_vs_sun_drift.txt"""
import csv, glob, math, os, statistics
from marine_hull.sail import Drone, vmg_up
D = {"hi": Drone(sail_area=0.90, hull_scale=1.20), "lo": Drone(sail_area=0.68, hull_scale=4.05)}
_s, _v = {}, {}
def spd(k0, t, th):
    k = (k0, round(t * 4) / 4, round(th / 5) * 5)
    if k not in _s: _s[k] = D[k0].speed(k[1], k[2])
    return _s[k]
def vmg(k0, t):
    k = (k0, round(t * 4) / 4)
    if k not in _v: _v[k] = vmg_up(D[k0], k[1], range(20, 91, 5))
    return _v[k]
def along(k0, t, wf, b):
    th = abs((wf - b + 180) % 360 - 180); m, tk = vmg(k0, t)
    return m / math.cos(math.radians(th)) if th < tk and m > 0 else spd(k0, t, th)
def read(f):
    return [(float(r["speed"]), float(r["dir"])) for r in csv.DictReader(open(f))
            if r["speed"] not in ("", "99.0", "MM") and r["dir"] not in ("", "999", "MM", "999.0")]
print("station month  ceiling(6r)  drift-aware  floor(6r)   (km/day; ratios to 86 km/day solar in brackets)")
rows = []
for f in sorted(glob.glob("experiments/data/ndbc_wind_*.csv")):
    st, ym = os.path.basename(f)[10:-4].split("_"); w = read(f)
    if len(w) < 1000: continue
    ce = fl = dr = 0.0
    for b in (0, 45, 90, 135):
        for s, dd in w:
            hi = 0.5 * (along("hi", s, dd, b) + along("hi", s, dd, b + 180)); ce += hi
            if s >= 4: fl += hi; dr += hi
            else: dr += 0.5 * (along("lo", s, dd, b) + along("lo", s, dd, b + 180))
    n = 4 * len(w); k = 86.4 / n
    rows.append((st, ym, ce * k, dr * k, fl * k))
    print(f"{st} {ym} {ce*k:8.0f} ({ce*k/86:.2f}) {dr*k:8.0f} ({dr*k/86:.2f}) {fl*k:8.0f} ({fl*k/86:.2f})")
for ym in ("202401", "202407"):
    r = [x for x in rows if x[1] == ym]; m = lambda i: statistics.median(x[i] for x in r)
    print(f"{ym}: {len(r)} buoys; median ceiling {m(2):.0f} ({m(2)/86:.2f}x solar), drift-aware {m(3):.0f} ({m(3)/86:.2f}x), floor {m(4):.0f} ({m(4)/86:.2f}x); "
          f"drift-aware >= solar in {sum(1 for x in r if x[3] >= 86)} of {len(r)}")

"""Milestone 6r: how much of 6o's wind-over-sun result rests on light-air hours (true wind < 4 m/s), where 6n/6q showed the
drone model is not a bound (2019 coverage 0.54, and 0.34 below 2 m/s)? Same 6n capability drone, same NDBC buoy winds, same four
corridor lines both ways as 6o. For each buoy-month: share of 10-minute blocks below 4 m/s; share of the modelled distance that
comes from them; mean corridor km/day as modelled (6o) and with every below-4 m/s block credited zero distance
(a floor if sail thrust is absent there); ratio to the 86 km/day solar ceiling for both.
Run: PYTHONPATH=src python3 experiments/run_wind_vs_sun_lightair_share.py > experiments/results_wind_vs_sun_lightair_share.txt"""
import csv, glob, math, os, statistics
from marine_hull.sail import Drone, vmg_up
d = Drone(sail_area=0.90, hull_scale=1.20)
_s, _v = {}, {}
def spd(t, th):
    k = (round(t * 4) / 4, round(th / 5) * 5)
    if k not in _s: _s[k] = d.speed(*k)
    return _s[k]
def vmg(t):
    k = round(t * 4) / 4
    if k not in _v: _v[k] = vmg_up(d, k, range(20, 91, 5))
    return _v[k]
def along(t, wf, b):
    th = abs((wf - b + 180) % 360 - 180); m, tk = vmg(t)
    return m / math.cos(math.radians(th)) if th < tk and m > 0 else spd(t, th)
def read(f):
    return [(float(r["speed"]), float(r["dir"])) for r in csv.DictReader(open(f))
            if r["speed"] not in ("", "99.0", "MM") and r["dir"] not in ("", "999", "MM", "999.0")]
print("station month  share<4m/s  share_of_distance_from<4  km/day_modelled  km/day_light_air_zeroed  ratio_to_solar(modelled, zeroed)")
rows = []
for f in sorted(glob.glob("experiments/data/ndbc_wind_*.csv")):
    st, ym = os.path.basename(f)[10:-4].split("_"); w = read(f)
    if len(w) < 1000: continue
    tot = lo = 0.0
    for b in (0, 45, 90, 135):
        for s, dr in w:
            v = 0.5 * (along(s, dr, b) + along(s, dr, b + 180)); tot += v
            if s < 4: lo += v
    n = 4 * len(w); mod = tot / n * 86.4; zer = (tot - lo) / n * 86.4
    sh = sum(1 for s, _ in w if s < 4) / len(w)
    rows.append((st, ym, sh, lo / tot, mod, zer))
    print(f"{st} {ym} {sh:8.2f} {lo/tot:10.2f} {mod:10.0f} {zer:10.0f}   {mod/86:.2f} {zer/86:.2f}")
for ym in ("202401", "202407"):
    r = [x for x in rows if x[1] == ym]
    print(f"{ym}: {len(r)} buoys; median share<4 {statistics.median(x[2] for x in r):.2f}; median distance share from <4 {statistics.median(x[3] for x in r):.2f}; "
          f"median modelled {statistics.median(x[4] for x in r):.0f} km/day ({statistics.median(x[4] for x in r)/86:.2f}x solar); "
          f"median zeroed {statistics.median(x[5] for x in r):.0f} ({statistics.median(x[5] for x in r)/86:.2f}x); zeroed >= solar in {sum(1 for x in r if x[5]>=86)} of {len(r)}")

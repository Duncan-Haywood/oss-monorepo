"""FITTED-DRONE RERUN (milestone 6m, sail_area 0.45 m2 from run_saildrone_fit.py) of the script of the same name without _fitted. Original docstring follows.
Milestone 6i: wind vs sun on a fixed survey line. 6h let the drone sail a free course; a survey line fixes the heading.
For each 10-minute NDBC buoy sample (speed, direction the wind blows FROM) and a line bearing B, the along-line speed is:
  true wind angle th = fold(wind_from - B) in 0..180; if th >= t_opt (best upwind VMG angle at that wind) sail direct, speed(tws, th);
  if th < t_opt tack between wind +-t_opt, along-line speed = VMG/cos(th) (derivation: time split p = sin(t+th)/(2 sin t cos th)), no tack cost.
A lawnmower survey runs each line both ways, so a bearing's progress is the mean of B and B+180. Bearings 0, 45, 90, 135 (all 8 headings).
Solar comparator: 86 km/day ceiling (1.0 m/s for 24 h, LOG milestones 1, 5j). Drone parameters are the sail.py defaults (swept elsewhere, none sourced).
Run: PYTHONPATH=src python3 experiments/run_wind_vs_sun_corridor.py > experiments/results_wind_vs_sun_corridor.txt"""
import csv, glob, math, os, statistics
from marine_hull.sail import Drone, vmg_up

d = Drone(sail_area=0.45)
_s, _v = {}, {}

def spd(tws, th):
    k = (round(tws * 4) / 4, round(th / 5) * 5)
    if k not in _s:
        _s[k] = d.speed(*k)
    return _s[k]

def vmg(tws):
    k = round(tws * 4) / 4
    if k not in _v:
        _v[k] = vmg_up(d, k, range(20, 91, 5))
    return _v[k]

def along(tws, wind_from, bearing):
    th = abs((wind_from - bearing + 180) % 360 - 180)
    m, t = vmg(tws)
    if th < t and m > 0:
        return m / math.cos(math.radians(th))
    return spd(tws, th)

def read(f):
    out = []
    for r in csv.DictReader(open(f)):
        if r["speed"] in ("", "99.0", "MM") or r["dir"] in ("", "999", "MM", "999.0"):
            continue
        out.append((float(r["speed"]), float(r["dir"])))
    return out

BEAR = (0, 45, 90, 135)
print("station month  hours  free_km/day(6h beam)  corridor_km/day: mean_of_4_lines  worst_line  best_line  share_days>=86(mean of lines)")
rows = []
for f in sorted(glob.glob("experiments/data/ndbc_wind_*.csv")):
    st, ym = os.path.basename(f)[10:-4].split("_")
    w = read(f)
    if len(w) < 1000:
        continue
    per = {}
    for b in BEAR:
        per[b] = [0.5 * (along(s, dr, b) + along(s, dr, b + 180)) for s, dr in w]
    n = 144
    km = {b: statistics.mean(v) * 86.4 for b, v in per.items()}
    sd = []
    for b, v in per.items():
        days = [sum(v[i:i + n]) / n * 86.4 for i in range(0, len(v) - n + 1, n)]
        sd.append(sum(1 for x in days if x >= 86) / len(days))
    free = statistics.mean(spd(s, 90) for s, _ in w) * 86.4
    r = (st, ym, len(w), free, statistics.mean(km.values()), min(km.values()), max(km.values()), statistics.mean(sd))
    rows.append(r)
    print(f"{st} {ym} {len(w):5d} {r[3]:8.0f} {r[4]:8.0f} {r[5]:8.0f} {r[6]:8.0f} {r[7]:8.2f}")
for ym in ("202401", "202407"):
    s = [r for r in rows if r[1] == ym]
    print(f"{ym}: {len(s)} buoys; median corridor mean km/day {statistics.median(r[4] for r in s):.0f} (min {min(r[4] for r in s):.0f}); median corridor/free {statistics.median(r[4]/r[3] for r in s):.2f} (min {min(r[4]/r[3] for r in s):.2f}); median worst line {statistics.median(r[5] for r in s):.0f}; median share of days >= 86 km/day {statistics.median(r[7] for r in s):.2f} (min {min(r[7] for r in s):.2f})")
print("fraction of buoy-months where corridor mean > 2x solar ceiling (172 km/day):", f"{sum(1 for r in rows if r[4] > 172)}/{len(rows)}")

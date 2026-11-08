"""Milestone 6j: does 6i's wind-over-sun margin survive a tack-time penalty? 6i tacked instantly (upper bound).
Here every sample on a tacking leg keeps the fraction L/(L+T) of its along-line speed, where T = time lost per tack
(speed near zero through the manoeuvre) and L = leg duration between tacks (set by the survey corridor width). Both are
swept, neither sourced. Direct-sailing samples are unchanged. Same buoy winds, lines, drone and solar ceiling as 6i.
Run: PYTHONPATH=src python3 experiments/run_wind_vs_sun_tack.py > experiments/results_wind_vs_sun_tack.txt"""
import csv, glob, math, os, statistics
from marine_hull.sail import Drone, vmg_up

d = Drone()
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

def along(tws, wind_from, bearing, keep):
    th = abs((wind_from - bearing + 180) % 360 - 180)
    m, t = vmg(tws)
    if th < t and m > 0:
        return keep * m / math.cos(math.radians(th))
    return spd(tws, th)

def read(f):
    out = []
    for r in csv.DictReader(open(f)):
        if r["speed"] in ("", "99.0", "MM") or r["dir"] in ("", "999", "MM", "999.0"):
            continue
        out.append((float(r["speed"]), float(r["dir"])))
    return out

BEAR = (0, 45, 90, 135)
CASES = [(0, 1), (30, 900), (60, 900), (120, 900), (60, 300), (120, 300), (120, 120)]  # (T s lost per tack, L s per leg)
data = {}
for f in sorted(glob.glob("experiments/data/ndbc_wind_*.csv")):
    st, ym = os.path.basename(f)[10:-4].split("_")
    w = read(f)
    if len(w) >= 1000:
        data[(st, ym)] = w
print("case T_s L_s keep | per month: median corridor km/day (min) ; median corridor/free ; buoy-months > 172 km/day ; median share of days >= 86")
for T, L in CASES:
    keep = L / (L + T)
    out = []
    for ym in ("202401", "202407"):
        rows = []
        for (st, m), w in data.items():
            if m != ym:
                continue
            km = []
            sd = []
            for b in BEAR:
                v = [0.5 * (along(s, dr, b, keep) + along(s, dr, b + 180, keep)) for s, dr in w]
                km.append(statistics.mean(v) * 86.4)
                days = [sum(v[i:i + 144]) / 144 * 86.4 for i in range(0, len(v) - 143, 144)]
                sd.append(sum(1 for x in days if x >= 86) / len(days))
            free = statistics.mean(spd(s, 90) for s, _ in w) * 86.4
            rows.append((statistics.mean(km), free, statistics.mean(sd)))
        out.append(f"{ym}: {statistics.median(r[0] for r in rows):.0f} ({min(r[0] for r in rows):.0f}); {statistics.median(r[0]/r[1] for r in rows):.2f}; {sum(1 for r in rows if r[0] > 172)}/{len(rows)}; {statistics.median(r[2] for r in rows):.2f} (min {min(r[2] for r in rows):.2f})")
    print(f"T={T:3d} L={L:3d} keep={keep:.2f} | " + " | ".join(out))

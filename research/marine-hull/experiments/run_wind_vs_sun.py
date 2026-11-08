"""Milestone 6h: when does wind beat sun? The default wing-sail drone (sail.py) on real NDBC buoy winds against the deck-solar boat's
best-range speed.
For each buoy-month (experiments/data/ndbc_wind_*_YYYYMM.csv, 10-minute speeds) the drone sails a free course (no corridor, no upwind
mark): speed at true wind angle 90 deg (beam reach, a choice) and at the best angle in 60..150 deg (upper bound). km/day = mean speed
x 86.4. The solar comparator is the 1.0 m/s best-range speed of the 4 to 5 m monohull (LOG milestones 1, 5j) held for 24 h = 86 km/day
at most; the real solar boat is also energy-limited, so 86 km/day is a ceiling, not a prediction. Threshold wind: the lowest wind speed at
which the drone's speed reaches 1.0 m/s. Wind is the buoy anemometer value (4 to 5 m, not corrected to sail height).
Run: PYTHONPATH=src python3 experiments/run_wind_vs_sun.py > experiments/results_wind_vs_sun.txt"""
import csv, glob, os, statistics
from marine_hull.sail import Drone

d = Drone()
ANG = range(60, 151, 10)
_cache = {}

def speeds(tws):
    k = round(tws * 4) / 4
    if k not in _cache:
        v = [d.speed(k, a) for a in ANG]
        _cache[k] = (d.speed(k, 90), max(v))
    return _cache[k]

def threshold(f):
    for i in range(1, 80):
        if f(i * 0.25) >= 1.0:
            return i * 0.25
    return None

print(f"cut-in wind (drone speed reaches 1.0 m/s): beam reach {threshold(lambda s: speeds(s)[0])} m/s, best of 60..150 deg {threshold(lambda s: speeds(s)[1])} m/s")
print("station month  hours  mean_wind  km/day_beam  km/day_best  share_hours_beam>=1m/s  share_days_beam_km/day>=86")
rows = []
for f in sorted(glob.glob("experiments/data/ndbc_wind_*.csv")):
    st, ym = os.path.basename(f)[10:-4].split("_")
    w = [float(r["speed"]) for r in csv.DictReader(open(f)) if r["speed"] not in ("", "99.0", "MM")]
    if len(w) < 1000:
        continue
    vb = [speeds(x)[0] for x in w]; vm = [speeds(x)[1] for x in w]
    n = 144
    days = [vb[i:i + n] for i in range(0, len(vb) - n + 1, n)]
    dk = [sum(x) / n * 86.4 for x in days]
    r = (st, ym, len(w), statistics.mean(w), statistics.mean(vb) * 86.4, statistics.mean(vm) * 86.4, sum(1 for x in vb if x >= 1) / len(vb), sum(1 for x in dk if x >= 86) / len(dk))
    rows.append(r)
    print(f"{st} {ym} {len(w):5d} {r[3]:6.2f} {r[4]:8.0f} {r[5]:8.0f} {r[6]:8.2f} {r[7]:8.2f}")
for ym in ("202401", "202407"):
    s = [r for r in rows if r[1] == ym]
    print(f"{ym}: {len(s)} buoys; median km/day beam {statistics.median(r[4] for r in s):.0f} (min {min(r[4] for r in s):.0f}, max {max(r[4] for r in s):.0f}); share of hours drone >= 1 m/s: median {statistics.median(r[6] for r in s):.2f} (min {min(r[6] for r in s):.2f}); share of days >= 86 km/day: median {statistics.median(r[7] for r in s):.2f}")

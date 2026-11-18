"""Milestone 6l: daily distance of fielded Saildrones on the NOAA west-coast surveys against the sail.py drone model.
6k compared one press-release mean (SD 1020, Southern Ocean). Here every drone-day with >= 90% coverage (>= 130 of 144 ten-minute
blocks) gives an observed path length (sum of SOG x 600 s) and the drone's own measured true wind. Two model distances per day:
  (a) model speed at the measured wind speed and the measured true wind angle (angle between COG and the wind-from direction),
      i.e. the model sailing the course the real drone sailed;
  (b) model free-course beam-reach speed at the measured wind (what 6h used for the buoys).
Ratio = observed / model. The median (b) ratio is the factor 6h-6j's buoy distances are scaled by.
Run: PYTHONPATH=src python3 experiments/run_saildrone_daily.py > experiments/results_saildrone_daily.txt"""
import csv, gzip, math, statistics, collections
from marine_hull.sail import Drone
d = Drone()
_c = {}
def spd(tws, twa):
    k = (round(tws * 2) / 2, min(180, round(twa / 10) * 10))
    if k not in _c: _c[k] = d.speed(*k)
    return _c[k]
days = collections.defaultdict(list)
with gzip.open("experiments/data/saildrone_10min.csv.gz", "rt") as f:
    for r in csv.DictReader(f):
        days[(r["year"], r["drone"], r["block"][:10])].append(r)
rows = []
for (yr, dr, day), bl in sorted(days.items()):
    if len(bl) < 130: continue
    obs = sum(float(b["sog"]) * 600 for b in bl) / 1000 * 144 / len(bl)      # km/day, scaled to 144 blocks
    ma = mb = 0.0; w = []
    for b in bl:
        u, v = float(b["u"]), float(b["v"]); tws = math.hypot(u, v); w.append(tws)
        wf = math.degrees(math.atan2(-u, -v)) % 360
        twa = abs((wf - float(b["cog"]) + 180) % 360 - 180)
        ma += spd(tws, twa) * 600; mb += spd(tws, 90) * 600
    k = 144 / len(bl) / 1000
    rows.append((yr, dr, day, statistics.mean(w), obs, ma * k, mb * k))
def q(x, p): x = sorted(x); return x[min(len(x) - 1, int(p * len(x)))]
print(f"drone-days with >=90% coverage: {len(rows)} ({len(set((r[0], r[1]) for r in rows))} drones)")
print("year drone days mean_wind_m/s obs_km/day model_actual_course model_beam_free  obs/a  obs/b (medians per drone-year)")
for key in sorted(set((r[0], r[1]) for r in rows)):
    s = [r for r in rows if (r[0], r[1]) == key]
    print(f"{key[0]} {key[1]} {len(s):4d} {statistics.median(r[3] for r in s):6.1f} {statistics.median(r[4] for r in s):8.0f} "
          f"{statistics.median(r[5] for r in s):8.0f} {statistics.median(r[6] for r in s):8.0f} "
          f"{statistics.median(r[4] / r[5] for r in s if r[5] > 5):6.2f} {statistics.median(r[4] / r[6] for r in s if r[6] > 5):6.2f}")
ra = [r[4] / r[5] for r in rows if r[5] > 5]; rb = [r[4] / r[6] for r in rows if r[6] > 5]
print(f"\nall drone-days: observed km/day median {statistics.median(r[4] for r in rows):.0f} (10th {q([r[4] for r in rows],.1):.0f}, 90th {q([r[4] for r in rows],.9):.0f}), mean wind median {statistics.median(r[3] for r in rows):.1f} m/s")
print(f"obs/(a) actual-course model: median {statistics.median(ra):.2f}  10th {q(ra,.1):.2f}  90th {q(ra,.9):.2f}  (n={len(ra)})")
print(f"obs/(b) free beam reach    : median {statistics.median(rb):.2f}  10th {q(rb,.1):.2f}  90th {q(rb,.9):.2f}  (n={len(rb)})")
print("\nby daily mean wind (obs/b median, n):")
for lo, hi in ((0, 4), (4, 6), (6, 8), (8, 10), (10, 30)):
    s = [r[4] / r[6] for r in rows if lo <= r[3] < hi and r[6] > 5]
    o = [r[4] for r in rows if lo <= r[3] < hi]
    if s: print(f"  {lo:2d}-{hi:2d} m/s: obs/b {statistics.median(s):.2f}  obs {statistics.median(o):.0f} km/day  n={len(s)}")
f = statistics.median(rb)
print(f"\nscaling 6h-6j's buoy medians by f = {f:.2f} (86 km/day solar ceiling):")
for lab, free, cor, cmin in (("January", 272, 237, 207), ("July", 219, 179, 114)):
    print(f"  {lab}: corridor median {cor} -> {cor*f:.0f}, worst buoy-month {cmin} -> {cmin*f:.0f}; free median {free} -> {free*f:.0f}; "
          f"scaled corridor median / solar {cor*f/86:.2f}; break-even f vs solar (median) {86/cor:.2f}, (worst buoy) {86/cmin:.2f}")

# capability check: per 10-minute block, observed SOG against the model at the measured wind and course. If the real drone
# often sails at the model speed, the daily gap is mission behaviour (station keeping, survey legs, waves); if even its best blocks
# stay well under the model, the model is optimistic.
print("\nper-block SOG / model speed at measured wind and COG, by wind speed (blocks with SOG>0 and model>0.3 m/s):")
blk = collections.defaultdict(list)
for key, bl in days.items():
    for b in bl:
        u, v = float(b["u"]), float(b["v"]); tws = math.hypot(u, v)
        wf = math.degrees(math.atan2(-u, -v)) % 360
        twa = abs((wf - float(b["cog"]) + 180) % 360 - 180)
        m = spd(tws, twa)
        if m > 0.3: blk[min(int(tws // 2) * 2, 14)].append(float(b["sog"]) / m)
for k in sorted(blk):
    x = blk[k]
    print(f"  wind {k:2d}-{k+2:2d} m/s: n={len(x):6d}  median {statistics.median(x):.2f}  75th {q(x,.75):.2f}  90th {q(x,.9):.2f}  99th {q(x,.99):.2f}")

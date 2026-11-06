"""Milestone 6m: calibrate the sail.py drone to fielded Saildrone speeds (fit 2018, test 2019).
6l found the default drone sails 2.5 to 3 times faster than fielded Saildrones, more so in light wind (observed/model 0.28 below
4 m/s, 0.60 above 10 m/s), so a single scalar (6l's 0.33) is a blunt correction. Here two parameters of sail.Drone are fitted:
sail_area (m2) and hull_scale (multiplier on still-water hull resistance). Data: the 10-minute blocks of
data/saildrone_10min.csv.gz (NOAA PMEL ERDDAP, CC0), each with SOG, COG and the drone's own true wind. Blocks are binned by
true wind speed (1 m/s) and true wind angle (15 deg, from COG); the objective is the n-weighted squared error between the model
speed and the cell MEAN SOG (the mean, not the median, because the mean is what sums to a daily distance). Fit on 2018 only,
then judged on 2019 drone-days: observed/model daily distance, by wind speed. References: default drone, 6l's scalar 0.33,
and the empirical cell-mean lookup fitted on 2018 (what a perfect smooth model of this data could do).
Run: PYTHONPATH=src python3 experiments/run_saildrone_fit.py > experiments/results_saildrone_fit.txt"""
import csv, gzip, math, statistics, collections, sys
from marine_hull.sail import Drone

def cell(tws, twa): return (min(int(tws), 16), min(int(twa // 15), 11))
def blocks():
    for r in csv.DictReader(gzip.open("experiments/data/saildrone_10min.csv.gz", "rt")):
        u, v = float(r["u"]), float(r["v"]); tws = math.hypot(u, v)
        wf = math.degrees(math.atan2(-u, -v)) % 360
        twa = abs((wf - float(r["cog"]) + 180) % 360 - 180)
        yield r["year"], r["drone"], r["block"][:10], tws, twa, float(r["sog"])
data = list(blocks())
stats = collections.defaultdict(lambda: [0, 0.0])
for y, dr, day, tws, twa, sog in data:
    if y == "2018":
        s = stats[cell(tws, twa)]; s[0] += 1; s[1] += sog
cells = {c: (n, t / n) for c, (n, t) in stats.items() if n >= 30}
print(f"blocks {len(data)}; 2018 fit cells (>= 30 blocks): {len(cells)} of 204, covering {sum(n for n, _ in cells.values())} blocks")

def make(area, hs):
    d = Drone(sail_area=area, hull_scale=hs); cache = {}
    def f(tws, twa):
        k = (min(int(tws), 16) + 0.5, min(int(twa // 15), 11) * 15 + 7.5)
        if k not in cache: cache[k] = d.speed(*k)
        return cache[k]
    return f
def sse(f):
    return sum(n * (f(c[0] + .5, c[1] * 15 + 7.5) - m) ** 2 for c, (n, m) in cells.items()) / sum(n for n, _ in cells.values())

AREAS = (0.5, 1, 1.5, 2, 3, 5)
HS = (1, 1.5, 2, 3, 4, 6, 8)
res = {}
print("\nfit grid: weighted mean-square error (m/s)^2 on 2018 cell means (sail_area rows, hull_scale columns)")
print("area\\hs " + " ".join(f"{h:7g}" for h in HS))
for a in AREAS:
    row = []
    for h in HS:
        res[(a, h)] = sse(make(a, h)); row.append(res[(a, h)])
    print(f"{a:6g}  " + " ".join(f"{x:7.3f}" for x in row)); sys.stdout.flush()
(a0, h0) = min(res, key=res.get)
print(f"\nbest grid point: sail_area {a0}, hull_scale {h0}, MSE {res[(a0, h0)]:.3f}; default (5, 1) MSE {sse(make(5, 1)):.3f}")
# refine around the best point
best = ((a0, h0), res[(a0, h0)])
for a in sorted({max(0.2, a0 * x) for x in (0.6, 0.75, 0.9, 1, 1.15, 1.35, 1.6)}):
    for h in sorted({max(0.5, h0 * x) for x in (0.6, 0.75, 0.9, 1, 1.15, 1.35, 1.6)}):
        e = sse(make(a, h))
        if e < best[1]: best = ((a, h), e)
(a1, h1), e1 = best
print(f"refined fit: sail_area {a1:.2f} m2, hull_scale {h1:.2f}, MSE {e1:.3f}")

# test on 2019 drone-days
fits = {"default": make(5, 1), "fitted": make(a1, h1)}
emp = {c: m for c, (n, m) in cells.items()}
def emp_f(tws, twa): return emp.get(cell(tws, twa))
days = collections.defaultdict(list)
for y, dr, day, tws, twa, sog in data:
    if y == "2019": days[(dr, day)].append((tws, twa, sog))
rows = []
for k, bl in days.items():
    if len(bl) < 130: continue
    sc = 144 / len(bl) / 1000 * 600
    obs = sum(b[2] for b in bl) * sc
    mw = statistics.mean(b[0] for b in bl)
    out = {n: sum(f(b[0], b[1]) for b in bl) * sc for n, f in fits.items()}
    e = [emp_f(b[0], b[1]) for b in bl]
    out["empirical"] = sum(x if x is not None else b[2] for x, b in zip(e, bl)) * sc  # uncovered cells fall back to the block itself (optimistic)
    rows.append((mw, obs, out))
def q(x, p): x = sorted(x); return x[min(len(x) - 1, int(p * len(x)))]
print(f"\ntest: {len(rows)} 2019 drone-days, observed median {statistics.median(r[1] for r in rows):.0f} km/day")
print("model daily distance / observed (median, 10th, 90th), by daily mean wind; 1.00 is perfect; n in brackets")
bins = ((0, 4), (4, 6), (6, 8), (8, 10), (10, 30), (0, 30))
for name in ("default", "fitted", "empirical"):
    print(f" {name}:")
    for lo, hi in bins:
        s = [r[2][name] / r[1] for r in rows if lo <= r[0] < hi and r[1] > 5]
        if s: print(f"   {lo:2d}-{hi:2d} m/s [{len(s):3d}] median {statistics.median(s):.2f}  10th {q(s,.1):.2f}  90th {q(s,.9):.2f}")
sc33 = [0.33 * r[2]["default"] / r[1] for r in rows if r[1] > 5]
print(f" scalar 0.33 x default (all winds): median {statistics.median(sc33):.2f}  10th {q(sc33,.1):.2f}  90th {q(sc33,.9):.2f}")
rel = {n: [abs(r[2][n] / r[1] - 1) for r in rows if r[1] > 5] for n in ("fitted", "empirical")}
rel["scalar"] = [abs(x - 1) for x in sc33]
print("median absolute daily-distance error: " + ", ".join(f"{n} {statistics.median(v):.2f}" for n, v in rel.items()))
print(f"\nFITTED PARAMS for 6n: sail_area={a1:.3f} hull_scale={h1:.3f}")

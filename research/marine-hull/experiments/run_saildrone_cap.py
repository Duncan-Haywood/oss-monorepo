"""Milestone 6n: fit sail.Drone to the 90th-percentile SOG per wind cell (capability), fit 2018, test 2019.
6m fitted cell MEANS, which describe a survey mission (turns, station keeping). A wind drone sailing a transit
is limited by capability, so here the target is the 90th percentile of SOG in each (1 m/s wind x 15 deg TWA) cell
with 30+ blocks in 2018. Two parameters (sail_area, hull_scale) as in 6m. Test on 2019: share of 2019 blocks whose
SOG exceeds the model (should be near 10% in each wind band if the fit is a capability curve), and the capability
speed as a multiple of the 6m mean-fit speed.
Run: PYTHONPATH=src python3 experiments/run_saildrone_cap.py > experiments/results_saildrone_cap.txt"""
import csv, gzip, math, statistics, collections
from marine_hull.sail import Drone

def cell(tws, twa): return (min(int(tws), 16), min(int(twa // 15), 11))
def blocks():
    for r in csv.DictReader(gzip.open("experiments/data/saildrone_10min.csv.gz", "rt")):
        u, v = float(r["u"]), float(r["v"]); tws = math.hypot(u, v)
        wf = math.degrees(math.atan2(-u, -v)) % 360
        twa = abs((wf - float(r["cog"]) + 180) % 360 - 180)
        yield r["year"], tws, twa, float(r["sog"])
data = list(blocks())
P = 0.90
by = collections.defaultdict(list)
for y, tws, twa, sog in data:
    if y == "2018": by[cell(tws, twa)].append(sog)
cells = {c: (len(v), sorted(v)[min(len(v) - 1, int(P * len(v)))]) for c, v in by.items() if len(v) >= 30}
print(f"blocks {len(data)}; 2018 cells (>= 30 blocks) {len(cells)}; target = {int(P*100)}th percentile SOG per cell")

def make(area, hs):
    d = Drone(sail_area=area, hull_scale=hs); cache = {}
    def f(tws, twa):
        k = (min(int(tws), 16) + 0.5, min(int(twa // 15), 11) * 15 + 7.5)
        if k not in cache: cache[k] = d.speed(*k)
        return cache[k]
    return f
def sse(f):
    return sum(n * (f(c[0] + .5, c[1] * 15 + 7.5) - m) ** 2 for c, (n, m) in cells.items()) / sum(n for n, _ in cells.values())
AREAS = (0.5, 0.75, 1, 1.5, 2, 3, 5); HS = (1, 1.5, 2, 3, 4, 6)
res = {(a, h): sse(make(a, h)) for a in AREAS for h in HS}
print("\ngrid MSE (m/s)^2 on 2018 p90 targets; rows sail_area, columns hull_scale")
print("area\\hs " + " ".join(f"{h:7g}" for h in HS))
for a in AREAS: print(f"{a:6g}  " + " ".join(f"{res[(a,h)]:7.3f}" for h in HS))
(a0, h0) = min(res, key=res.get); best = ((a0, h0), res[(a0, h0)])
for a in sorted({max(0.2, a0 * x) for x in (0.6, 0.75, 0.9, 1, 1.15, 1.35, 1.6)}):
    for h in sorted({max(0.5, h0 * x) for x in (0.6, 0.75, 0.9, 1, 1.15, 1.35, 1.6)}):
        e = sse(make(a, h))
        if e < best[1]: best = ((a, h), e)
(a1, h1), e1 = best
print(f"\nrefined: sail_area {a1:.2f} m2, hull_scale {h1:.2f}, MSE {e1:.3f}; 6m mean fit (0.45, 1.0) gives MSE {sse(make(0.45,1.0)):.3f}; default (5,1) {sse(make(5,1)):.3f}")

cap, mean = make(a1, h1), make(0.45, 1.0)
print("\n2019 test, by wind band: share of blocks with SOG above the capability model; capability/mean-fit speed")
for lo, hi in ((0, 4), (4, 6), (6, 8), (8, 10), (10, 30)):
    b = [(t, a, s) for y, t, a, s in data if y == "2019" and lo <= t < hi]
    if not b: continue
    over = sum(s > cap(t, a) for t, a, s in b) / len(b)
    r = statistics.median(cap(t, a) / mean(t, a) for t, a, s in b if mean(t, a) > 0.05)
    print(f" {lo:2d}-{hi:2d} m/s [{len(b):6d}] share above model {over:.3f}  median cap/mean-fit {r:.2f}")
b = [(t, a, s) for y, t, a, s in data if y == "2019"]
print(f" all     [{len(b):6d}] share above model {sum(s > cap(t,a) for t,a,s in b)/len(b):.3f}")
b8 = [(t, a, s) for y, t, a, s in data if y == "2018"]
print(f" 2018 in-sample share above model {sum(s > cap(t,a) for t,a,s in b8)/len(b8):.3f} (target {1-P:.2f}; cells under 30 blocks included)")
print(f"\nFITTED CAPABILITY PARAMS: sail_area={a1:.3f} hull_scale={h1:.3f}")

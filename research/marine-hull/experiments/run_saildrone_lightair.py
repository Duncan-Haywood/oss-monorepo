"""Milestone 6q: light-air capability fit. 6n's 90th-percentile fit covered only 0.54 of 2019 blocks below 4 m/s.
Here the fit uses only 2018 blocks with true wind < 4 m/s, in 0.5 m/s x 15 deg cells (>= 20 blocks), target the cell 90th
percentile SOG, two parameters (sail_area, hull_scale) as in 6n. Judged on 2019 light-air blocks: coverage (share of blocks with
SOG <= model speed; a bound that is right covers ~0.90) and the same for 6n's (0.90, 1.20) drone as reference.
Run: PYTHONPATH=src python3 experiments/run_saildrone_lightair.py > experiments/results_saildrone_lightair.txt"""
import csv, gzip, math, collections
from marine_hull.sail import Drone
LIM = 4.0
def cell(tws, twa): return (int(tws * 2), min(int(twa // 15), 11))
rows = []
for r in csv.DictReader(gzip.open("experiments/data/saildrone_10min.csv.gz", "rt")):
    u, v = float(r["u"]), float(r["v"]); tws = math.hypot(u, v)
    if tws >= LIM: continue
    wf = math.degrees(math.atan2(-u, -v)) % 360
    twa = abs((wf - float(r["cog"]) + 180) % 360 - 180)
    rows.append((r["year"], tws, twa, float(r["sog"])))
st = collections.defaultdict(list)
for y, tws, twa, sog in rows:
    if y == "2018": st[cell(tws, twa)].append(sog)
def pct(v, p): v = sorted(v); return v[min(len(v) - 1, int(p * len(v)))]
cells = {c: (len(v), pct(v, .9)) for c, v in st.items() if len(v) >= 20}
n18 = sum(1 for r in rows if r[0] == "2018"); n19 = sum(1 for r in rows if r[0] == "2019")
print(f"light-air blocks: 2018 {n18}, 2019 {n19}; fit cells {len(cells)}, covering {sum(n for n,_ in cells.values())} blocks")
def make(a, h):
    d = Drone(sail_area=a, hull_scale=h); cache = {}
    def f(tws, twa):
        k = (cell(tws, twa)[0] / 2 + .25, cell(tws, twa)[1] * 15 + 7.5)
        if k not in cache: cache[k] = d.speed(*k)
        return cache[k]
    return f
def sse(f): return sum(n * (f(c[0] / 2 + .25, c[1] * 15 + 7.5) - m) ** 2 for c, (n, m) in cells.items()) / sum(n for n, _ in cells.values())
res = {}
for a in (0.5, 0.9, 1.5, 2, 3, 5):
    for h in (0.5, 1, 1.2, 1.5, 2, 3, 4):
        res[(a, h)] = sse(make(a, h))
(a0, h0) = min(res, key=res.get)
print(f"best grid: sail_area {a0}, hull_scale {h0}, MSE {res[(a0,h0)]:.4f}; 6n drone (0.9,1.2) MSE {sse(make(.9,1.2)):.4f}")
best = ((a0, h0), res[(a0, h0)])
for a in {max(.2, a0 * x) for x in (.6, .75, .9, 1, 1.15, 1.35, 1.6)}:
    for h in {max(.3, h0 * x) for x in (.6, .75, .9, 1, 1.15, 1.35, 1.6)}:
        e = sse(make(a, h))
        if e < best[1]: best = ((a, h), e)
(a1, h1), e1 = best
print(f"refined: sail_area {a1:.2f}, hull_scale {h1:.2f}, MSE {e1:.4f}")
for name, f in (("6n drone", make(.9, 1.2)), ("light-air fit", make(a1, h1))):
    for lo, hi in ((0, 4), (0, 2), (2, 3), (3, 4)):
        b = [r for r in rows if r[0] == "2019" and lo <= r[1] < hi]
        cov = sum(1 for _, t, w, s in b if s <= f(t, w)) / len(b) if b else float("nan")
        print(f"{name:14s} 2019 wind {lo}-{hi} m/s: n {len(b):6d} coverage {cov:.3f}")

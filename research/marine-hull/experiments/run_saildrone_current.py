"""Milestone 6s: add a current term to the light-air capability drone. 6q found that below 2 m/s two thirds of 2019 blocks
beat even the light-air fit, so SOG there is mostly current and drift. Model: SOG_p90 = drone speed (sail_area, hull_scale) + c,
where c is the 90th-percentile SOG of near-calm blocks (true wind < 1 m/s), read from 2018 only, not fitted. The two drone
parameters are then fitted on 2018 light-air cells (0.5 m/s x 15 deg, >= 20 blocks, target the cell p90 SOG), and coverage
(share of blocks with SOG <= model; a bound that is right covers ~0.90) is judged on 2019 light-air blocks, by wind band.
References: 6n drone (0.9, 1.2) and 6q fit, both without current.
Run: PYTHONPATH=src python3 experiments/run_saildrone_current.py > experiments/results_saildrone_current.txt"""
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
def pct(v, p): v = sorted(v); return v[min(len(v) - 1, int(p * len(v)))]
calm18 = [s for y, t, w, s in rows if y == "2018" and t < 1.0]
calm19 = [s for y, t, w, s in rows if y == "2019" and t < 1.0]
C = pct(calm18, .9)
print(f"near-calm (wind < 1 m/s) blocks: 2018 {len(calm18)}, 2019 {len(calm19)}; p90 SOG 2018 {C:.3f} m/s, 2019 {pct(calm19,.9):.3f}; "
      f"median 2018 {pct(calm18,.5):.3f}, 2019 {pct(calm19,.5):.3f}")
st = collections.defaultdict(list)
for y, tws, twa, sog in rows:
    if y == "2018": st[cell(tws, twa)].append(sog)
cells = {c: (len(v), pct(v, .9)) for c, v in st.items() if len(v) >= 20}
print(f"fit cells {len(cells)}, blocks {sum(n for n,_ in cells.values())}")
def make(a, h, c):
    d = Drone(sail_area=a, hull_scale=h); cache = {}
    def f(tws, twa):
        k = (cell(tws, twa)[0] / 2 + .25, cell(tws, twa)[1] * 15 + 7.5)
        if k not in cache: cache[k] = d.speed(*k) + c
        return cache[k]
    return f
def sse(f): return sum(n * (f(c[0] / 2 + .25, c[1] * 15 + 7.5) - m) ** 2 for c, (n, m) in cells.items()) / sum(n for n, _ in cells.values())
res = {(a, h): sse(make(a, h, C)) for a in (0.2, 0.5, 0.9, 1.5, 3, 5) for h in (0.5, 1, 1.2, 1.5, 2, 3, 4)}
(a0, h0) = min(res, key=res.get); best = ((a0, h0), res[(a0, h0)])
for a in {max(.1, a0 * x) for x in (.6, .75, .9, 1, 1.15, 1.35, 1.6)}:
    for h in {max(.3, h0 * x) for x in (.6, .75, .9, 1, 1.15, 1.35, 1.6)}:
        e = sse(make(a, h, C))
        if e < best[1]: best = ((a, h), e)
(a1, h1), e1 = best
print(f"fit with current c={C:.3f}: sail_area {a1:.2f}, hull_scale {h1:.2f}, MSE {e1:.4f}  (6q no-current MSE 0.053, 6n drone no current {sse(make(.9,1.2,0)):.4f})")
for name, f in (("6n drone", make(.9, 1.2, 0)), ("6n drone + c", make(.9, 1.2, C)), ("fit + current", make(a1, h1, C))):
    out = []
    for lo, hi in ((0, 4), (0, 2), (2, 3), (3, 4)):
        b = [r for r in rows if r[0] == "2019" and lo <= r[1] < hi]
        out.append(f"{lo}-{hi}: {sum(1 for _, t, w, s in b if s <= f(t, w)) / len(b):.3f}")
    print(f"{name:14s} 2019 coverage (n=18921 total) " + "  ".join(out))

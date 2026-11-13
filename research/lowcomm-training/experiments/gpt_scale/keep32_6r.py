"""Milestone 6r (part 2): paired excess at size 2, H = 64, keep 1/32 (omega 31) vs uncompressed, seeds 0 to 3, scored against
the bands registered from refit4_6r.py before the run. Then refits the three forms on all five keep levels. Reads scale.jsonl.
Usage: python3 keep32_6r.py"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
c = {}
for l in open(os.path.join(HERE, "scale.jsonl")):
    r = json.loads(l); c.setdefault((r["H"], round(r["keep"], 6)), {})[r["seed"]] = r["loss"]
cells = []
for k in (0.25, 0.125, 1 / 12, 0.0625, 1 / 32):
    d, b = c[(64, round(k, 6))], c[(64, 1.0)]
    s = sorted(set(d) & set(b)); x = [d[i] - b[i] for i in s]; mu = sum(x) / len(x)
    se = (sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5 / len(x) ** .5
    cells.append((round(1 / k - 1), mu, se))
    print(f"omega {1/k-1:.0f}: seeds {s} excess {mu:+.4f} se {se:.4f} per-seed {[round(v, 4) for v in x]}")
o, m, e = cells[-1]
finite = math.isfinite(m)
print(f"H6r-i  (inside hinge band +0.108..+0.205): {'held' if finite and 0.108 <= m <= 0.205 else 'refuted'}")
print(f"H6r-ii (below power band edge +0.27):     {'held' if finite and m < 0.27 else 'refuted'}")
print(f"H6r-iii(above linear band edge +0.074):   {'held' if (not finite) or m > 0.074 else 'refuted'}")
GRID = {"linear": [0], "power": [0.5 + 0.25 * i for i in range(47)], "hinge": [0.25 * i for i in range(121)]}
f = lambda fm, p, w: w if fm == "linear" else w ** p if fm == "power" else max(0.0, w - p)
def fit(fm, pts):
    best = None
    for p in GRID[fm]:
        g = [f(fm, p, w) for w, _, _ in pts]
        den = sum(gi * gi / s ** 2 for gi, (_, _, s) in zip(g, pts))
        if den == 0: continue
        a = sum(gi * mm / s ** 2 for gi, (_, mm, s) in zip(g, pts)) / den
        chi = sum(((mm - a * gi) / s) ** 2 for gi, (_, mm, s) in zip(g, pts))
        if best is None or chi < best[0]: best = (chi, a, p)
    return best
if finite:
    print("five-cell refit (chi2, a, p):")
    for fm in GRID:
        chi, a, p = fit(fm, cells); print(f"  {fm:7s} chi2 {chi:7.2f} a {a:.6f} p {p:5.2f}")

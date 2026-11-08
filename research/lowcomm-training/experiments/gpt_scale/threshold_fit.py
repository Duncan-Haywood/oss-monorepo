"""Milestone 6p: which form in omega fits the size-2, H = 64 compression excess at three keep levels? Analysis only, reads scale.jsonl.

Forms (cell excess vs omega = 1/keep - 1): linear a*omega; power a*omega^g (g grid 0.5..8); hinge a*max(0, omega - w0) (w0 grid 0..14).
Weights 1/se^2. Score = leave-one-cell-out prediction error in se units (RMS). Parametric bootstrap: cell means ~ N(mean, se^2), 4,000 draws.
Usage: python3 threshold_fit.py"""
import json, os, random, math
HERE = os.path.dirname(os.path.abspath(__file__))
rows = [json.loads(l) for l in open(os.path.join(HERE, "scale.jsonl"))]
c = {}
for r in rows: c.setdefault((r["H"], r["keep"]), {})[r["seed"]] = r["loss"]
H = 64
cells = []
for k in (0.25, 0.125, 0.0625):
    d, b = c[(H, k)], c[(H, 1.0)]
    s = sorted(set(d) & set(b)); x = [d[i] - b[i] for i in s]; mu = sum(x) / len(x)
    sd = (sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5
    cells.append((1 / k - 1, mu, sd / len(x) ** .5))
print("cells (omega, excess, se):", [(o, round(m, 4), round(e, 4)) for o, m, e in cells])
GRID = {"linear": [0], "power": [0.5 + 0.25 * i for i in range(31)], "hinge": [float(i) for i in range(15)]}
def f(form, p, o):
    return o if form == "linear" else o ** p if form == "power" else max(0.0, o - p)
def fit(form, pts):
    best = None
    for p in GRID[form]:
        g = [f(form, p, o) for o, _, _ in pts]
        den = sum(gi * gi / e ** 2 for gi, (_, _, e) in zip(g, pts))
        if den == 0: continue
        a = sum(gi * m / e ** 2 for gi, (_, m, e) in zip(g, pts)) / den
        chi = sum(((m - a * gi) / e) ** 2 for gi, (_, m, e) in zip(g, pts))
        if best is None or chi < best[0]: best = (chi, a, p)
    return best
def loo(form, pts):
    errs = []
    for i in range(len(pts)):
        tr = pts[:i] + pts[i + 1:]; b = fit(form, tr)
        if b is None: return float("inf")
        _, a, p = b; o, m, e = pts[i]
        errs.append((m - a * f(form, p, o)) / e)
    return (sum(v * v for v in errs) / len(errs)) ** .5
forms = list(GRID)
print("observed fit chi2 / LOO RMS (se units):")
for fm in forms:
    b = fit(fm, cells); print(f"  {fm:7s} chi2 {b[0]:.2f} a {b[1]:.4f} p {b[2]:.2f}  LOO {loo(fm, cells):.2f}")
random.seed(0); B = 4000; worst = {f: 0 for f in forms}; close = 0; w0s = []; ph = 0
for _ in range(B):
    pts = [(o, random.gauss(m, e), e) for o, m, e in cells]
    l = {fm: loo(fm, pts) for fm in forms}
    worst[max(l, key=l.get)] += 1
    if abs(l["power"] - l["hinge"]) < 1: close += 1
    w0s.append(fit("hinge", pts)[2])
w0s.sort()
print("share of draws where each form has the worst LOO:", {k: round(v / B, 3) for k, v in worst.items()})
print("share of draws with |LOO power - LOO hinge| < 1 se:", round(close / B, 3))
print("hinge w0 bootstrap 2.5/50/97.5 percentiles:", w0s[int(.025 * B)], w0s[B // 2], w0s[int(.975 * B)])

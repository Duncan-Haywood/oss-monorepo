"""Milestone 6r (part 1, analysis only): refit the 6p forms in omega on the four H = 64 keep levels (1/4, 1/8, 1/12, 1/16)
and register each form's prediction at keep 1/32 (omega 31) before that run. Reads scale.jsonl; stdlib only.

Forms (paired excess vs omega = 1/keep - 1): linear a*omega; power a*omega^g (g grid 0.5..12 step 0.25);
hinge a*max(0, omega - w0) (w0 grid 0..14 step 0.25). Weights 1/se^2. Score: chi-square, leave-one-cell-out RMS (se units).
Parametric bootstrap (cell means ~ N(mean, se^2), 4,000 draws): w0 interval and 95% band of each form's omega-31 prediction.
Usage: python3 refit4_6r.py"""
import json, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
c = {}
for l in open(os.path.join(HERE, "scale.jsonl")):
    r = json.loads(l); c.setdefault((r["H"], round(r["keep"], 6)), {})[r["seed"]] = r["loss"]
H = 64
KEEPS = (0.25, 0.125, 1 / 12, 0.0625)
cells = []
for k in KEEPS:
    d, b = c[(H, round(k, 6))], c[(H, 1.0)]
    s = sorted(set(d) & set(b)); x = [d[i] - b[i] for i in s]; mu = sum(x) / len(x)
    sd = (sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5
    cells.append((round(1 / k - 1), mu, sd / len(x) ** .5))
print("cells (omega, excess, se):", [(o, round(m, 4), round(e, 4)) for o, m, e in cells])
GRID = {"linear": [0], "power": [0.5 + 0.25 * i for i in range(47)], "hinge": [0.25 * i for i in range(57)]}
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
TARGET = 31
print("observed fit: chi2 (dof = 4 - params), a, p, LOO RMS (se units), prediction at omega 31:")
for fm in GRID:
    chi, a, p = fit(fm, cells)
    print(f"  {fm:7s} chi2 {chi:6.2f} a {a:.6f} p {p:5.2f}  LOO {loo(fm, cells):5.2f}  pred31 {a * f(fm, p, TARGET):+.4f}")
random.seed(0); B = 4000; preds = {fm: [] for fm in GRID}; w0s = []; best = {fm: 0 for fm in GRID}
for _ in range(B):
    pts = [(o, random.gauss(m, e), e) for o, m, e in cells]
    fits = {fm: fit(fm, pts) for fm in GRID}
    for fm, (chi, a, p) in fits.items(): preds[fm].append(a * f(fm, p, TARGET))
    best[min(fits, key=lambda k: fits[k][0])] += 1
    w0s.append(fits["hinge"][2])
q = lambda v, t: sorted(v)[int(t * (len(v) - 1))]
print("share of draws in which each form has the lowest chi2:", {k: round(v / B, 3) for k, v in best.items()})
print("hinge w0 bootstrap 2.5/50/97.5:", q(w0s, .025), q(w0s, .5), q(w0s, .975))
for fm in GRID:
    print(f"omega-31 prediction band {fm:7s} 2.5/50/97.5: {q(preds[fm], .025):+.4f} {q(preds[fm], .5):+.4f} {q(preds[fm], .975):+.4f}")

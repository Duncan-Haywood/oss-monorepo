"""Milestone 6m: which form in H describes the size-2 compression excess, scored leave-one-cell-out? Analysis only, reads scale.jsonl.

excess(H, keep) = mean over paired seeds of (loss at keep) - (loss uncompressed, same seed). Candidate forms, each times omega = 1/keep - 1:
  power      a * (H/16)^b          (the 6f rule's form in H)
  saturating a * H/(H + h0)        (rises, then plateaus)
  plateau    a                     (no dependence on H)
  linlog     a + c*log2(H/16)      (omega-scaled, free slope)
Fits are least squares on the excess cells weighted by 1/se^2 (paired-difference standard error), grid over the nonlinear parameter.
Usage: python3 refit.py"""
import json, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
rows = [json.loads(l) for l in open(os.path.join(HERE, "scale.jsonl"))]
c = {}
for r in rows: c.setdefault((r["H"], r["keep"]), {})[r["seed"]] = r["loss"]
cells = {}  # (H, keep) -> (excess, se)
for (H, k), d in c.items():
    if k < 1 and (H, 1.0) in c:
        common = sorted(set(d) & set(c[(H, 1.0)]))
        if len(common) < 2: continue
        x = [d[s] - c[(H, 1.0)][s] for s in common]; mu = sum(x) / len(x)
        sd = (sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5
        cells[(H, k)] = (mu, max(sd / len(x) ** .5, 1e-3))
om = lambda k: 1 / k - 1
G = [i / 20 for i in range(-20, 41)]
H0 = [2 ** (i / 2) for i in range(-2, 17)]
def basis(form, p):  # returns function (H, k) -> list of linear columns
    if form == "power": return lambda H, k: [om(k) * (H / 16) ** p]
    if form == "saturating": return lambda H, k: [om(k) * H / (H + p)]
    if form == "plateau": return lambda H, k: [om(k)]
    if form == "linlog": return lambda H, k: [om(k), om(k) * math.log2(H / 16)]
GRID = {"power": G, "saturating": H0, "plateau": [0], "linlog": [0]}
def solve(A, y, w):
    n = len(A[0]); M = [[sum(wi * r[i] * r[j] for r, wi in zip(A, w)) for j in range(n)] + [sum(wi * r[i] * t for r, t, wi in zip(A, y, w))] for i in range(n)]
    for i in range(n):
        piv = max(range(i, n), key=lambda q: abs(M[q][i])); M[i], M[piv] = M[piv], M[i]
        if abs(M[i][i]) < 1e-14: return None
        for q in range(n):
            if q != i:
                f = M[q][i] / M[i][i]; M[q] = [a - f * b for a, b in zip(M[q], M[i])]
    return [M[i][n] / M[i][i] for i in range(n)]
def fit(form, tr):
    best = None
    for p in GRID[form]:
        f = basis(form, p); keys = list(tr)
        A = [f(*k) for k in keys]; y = [tr[k][0] for k in keys]; w = [1 / tr[k][1] ** 2 for k in keys]
        th = solve(A, y, w)
        if th is None: continue
        s = sum(wi * (sum(a * t for a, t in zip(r, th)) - yi) ** 2 for r, yi, wi in zip(A, y, w))
        if best is None or s < best[0]: best = (s, th, p)
    return best
print("excess cells (H, keep): excess, se")
for k in sorted(cells): print(" ", k, f"{cells[k][0]:+.4f}  {cells[k][1]:.4f}")
for form in GRID:
    s, th, p = fit(form, cells); f = basis(form, p)
    print(f"\n{form}: all-cell fit theta={[round(t, 5) for t in th]} nonlinear={p}  weighted SSE {s:.2f}")
    errs = []
    for k in sorted(cells):
        tr = {j: v for j, v in cells.items() if j != k}
        b = fit(form, tr)
        if b is None: continue
        pred = sum(a * t for a, t in zip(basis(form, b[2])(*k), b[1]))
        errs.append((k, pred - cells[k][0], (pred - cells[k][0]) / cells[k][1]))
    print("  leave-one-cell-out error (nats; in se):", ", ".join(f"{k}:{e:+.4f}({z:+.1f})" for k, e, z in errs))
    print(f"  LOO RMSE {math.sqrt(sum(e * e for _, e, _ in errs) / len(errs)):.4f} nats; mean |z| {sum(abs(z) for *_, z in errs) / len(errs):.2f}")

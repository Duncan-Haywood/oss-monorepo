"""Independent reference values for the engine's tests (numpy/scipy, written from the papers,
not from engine.mjs). Run: python3 eval/make_reference.py > eval/reference.json

- Deming and weighted Deming point estimates: the closed form in numpy, and scipy.odr
  (orthogonal distance regression with per-point weights, an iterative solver: agrees to about 1e-5).
- Jackknife: an explicit leave-one-out loop that refits from scratch.
- Passing-Bablok: every pairwise slope listed with numpy, using Fractions to find ties and -1 exactly.
- Kendall's tau-b: scipy.stats.kendalltau (asymptotic p-value).
"""
import json, sys, math, random
from fractions import Fraction
import numpy as np
from scipy import odr, stats

def deming_odr(x, y, lam, w=None):
    w = np.ones(len(x)) if w is None else np.asarray(w)
    ols = np.polyfit(x, y, 1)
    d = odr.Data(x, y, wd=w, we=w / lam)
    out = odr.ODR(d, odr.unilinear, beta0=[ols[0], ols[1]], sstol=1e-15, partol=1e-15, maxit=1000).run()
    return float(out.beta[1]), float(out.beta[0])  # intercept, slope

def deming_closed(x, y, lam):
    mx, my = x.mean(), y.mean()
    sxx = ((x - mx) ** 2).sum(); syy = ((y - my) ** 2).sum(); sxy = ((x - mx) * (y - my)).sum()
    u = syy - lam * sxx
    b = (u + math.sqrt(u * u + 4 * lam * sxy * sxy)) / (2 * sxy)
    return my - b * mx, b

def jackknife(fit, x, y):
    n = len(x)
    est = np.array([fit(np.delete(x, i), np.delete(y, i)) for i in range(n)])
    m = est.mean(axis=0)
    v = (n - 1) / n * ((est - m).T @ (est - m))
    return math.sqrt(v[0, 0]), math.sqrt(v[1, 1]), v[0, 1]

def weighted_deming(x, y, lam):
    a, b = deming_closed(x, y, lam)
    for _ in range(500):
        xh = (lam * x + b * (y - a)) / (lam + b * b)
        w = 1 / ((xh + a + b * xh) / 2) ** 2
        mx = (w * x).sum() / w.sum(); my = (w * y).sum() / w.sum()
        u = (w * (x - mx) ** 2).sum(); q = (w * (y - my) ** 2).sum(); p = (w * (x - mx) * (y - my)).sum()
        nb = ((q - lam * u) + math.sqrt((q - lam * u) ** 2 + 4 * lam * p * p)) / (2 * p)
        na = my - nb * mx
        if abs(nb - b) < 1e-13 and abs(na - a) < 1e-13:
            a, b = na, nb
            break
        a, b = na, nb
    xh = (lam * x + b * (y - a)) / (lam + b * b)
    w = 1 / ((xh + a + b * xh) / 2) ** 2
    return a, b, w

def passing_bablok(xs, ys, alpha=0.05):
    X = [Fraction(str(v)) for v in xs]; Y = [Fraction(str(v)) for v in ys]
    n = len(X); s = []
    for i in range(n):
        for j in range(i + 1, n):
            dx, dy = X[j] - X[i], Y[j] - Y[i]
            if dx == 0:
                if dy != 0: s.append(math.inf)
                continue
            q = dy / dx
            if q == -1: continue
            s.append(q)
    s.sort()
    N = len(s); K = sum(1 for v in s if v < -1)
    at = lambda r: float(s[r - 1])
    b = at((N + 1) // 2 + K) if N % 2 else (at(N // 2 + K) + at(N // 2 + 1 + K)) / 2
    C = stats.norm.ppf(1 - alpha / 2) * math.sqrt(n * (n - 1) * (2 * n + 5) / 18)
    M1 = int(math.floor((N - C) / 2 + 0.5)); M2 = N - M1 + 1
    lo, hi = at(M1 + K), at(M2 + K)
    x = np.asarray(xs, float); y = np.asarray(ys, float)
    med = lambda bb: float(np.median(y - bb * x))
    return dict(slope=b, intercept=med(b), slopeCI=[lo, hi], interceptCI=[med(hi), med(lo)], N=N, K=K)

def case(x, y, lam=1.0, weighted=True):
    x = np.asarray(x, float); y = np.asarray(y, float)
    oa, ob = deming_odr(x, y, lam)
    a, b = deming_closed(x, y, lam)
    sa, sb, cab = jackknife(lambda xx, yy: deming_closed(xx, yy, lam), x, y)
    out = dict(x=x.tolist(), y=y.tolist(), lam=lam, deming=dict(intercept=a, slope=b, odrIntercept=oa, odrSlope=ob, seIntercept=sa, seSlope=sb, covAB=cab))
    if weighted:
        wa, wb, w = weighted_deming(x, y, lam)
        oa, ob = deming_odr(x, y, lam, w)  # fixed-weight ODR at the converged weights
        out["weightedDeming"] = dict(intercept=wa, slope=wb, odrIntercept=oa, odrSlope=ob)
    out["passingBablok"] = passing_bablok(x.tolist(), y.tolist())
    kt = stats.kendalltau(x, y, variant="b", method="asymptotic")
    out["kendall"] = dict(tau=float(kt.statistic), p=float(kt.pvalue))
    return out

rnd = random.Random(20261117)
cases = []
for k in range(40):
    n = rnd.randint(8, 60)
    truth = [rnd.uniform(2, 200) for _ in range(n)]
    b, a = rnd.uniform(0.8, 1.25), rnd.uniform(-5, 5)
    prop = k % 2 == 1
    x = [round(t + rnd.gauss(0, 0.06 * t if prop else 3), 1) for t in truth]
    y = [round(a + b * t + rnd.gauss(0, 0.06 * t if prop else 3), 1) for t in truth]
    if min(x) <= 0 or min(y) <= 0:
        continue
    cases.append(case(x, y, lam=[1.0, 0.5, 2.0, 4.0][k % 4]))
def passing_bablok_numpy(xs, ys, alpha=0.05):
    # Same definition, vectorised for thousands of pairs: readings with 2 decimals scaled to integers.
    X = np.rint(np.asarray(xs) * 100).astype(np.int64); Y = np.rint(np.asarray(ys) * 100).astype(np.int64)
    n = len(X); i, j = np.triu_indices(n, 1)
    dx = X[j] - X[i]; dy = Y[j] - Y[i]
    keep = ~((dx == 0) & (dy == 0)) & ~((dx != 0) & (dy == -dx))
    dx, dy = dx[keep], dy[keep]
    s = np.where(dx == 0, np.inf, dy / np.where(dx == 0, 1, dx)); s.sort()
    N = len(s); K = int((s < -1).sum())
    at = lambda r: float(s[r - 1])
    b = at((N + 1) // 2 + K) if N % 2 else (at(N // 2 + K) + at(N // 2 + 1 + K)) / 2
    C = stats.norm.ppf(1 - alpha / 2) * math.sqrt(n * (n - 1) * (2 * n + 5) / 18)
    M1 = int(math.floor((N - C) / 2 + 0.5)); M2 = N - M1 + 1
    x = np.asarray(xs, float); y = np.asarray(ys, float)
    med = lambda bb: float(np.median(y - bb * x))
    lo, hi = at(M1 + K), at(M2 + K)
    return dict(slope=b, intercept=med(b), slopeCI=[lo, hi], interceptCI=[med(hi), med(lo)], N=N, K=K)

import csv, os
here = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(here, "..", "data", "nhanes-2017-2018-systolic.csv"))))
bx = np.array([float(r["mercury_sbp"]) for r in rows]); by = np.array([float(r["oscillometric_sbp"]) for r in rows])
oa, ob = deming_odr(bx, by, 1.0)
da, db = deming_closed(bx, by, 1.0)
sa, sb, cab = jackknife(lambda xx, yy: deming_closed(xx, yy, 1.0), bx, by)
kt = stats.kendalltau(bx, by, variant="b", method="asymptotic")
nhanes = dict(n=len(bx), deming=dict(intercept=da, slope=db, odrIntercept=oa, odrSlope=ob, seIntercept=sa, seSlope=sb, covAB=cab),
              passingBablok=passing_bablok_numpy(bx, by), kendall=dict(tau=float(kt.statistic), z=None),
              ols=dict(slope=float(np.polyfit(bx, by, 1)[0])))
json.dump(dict(generator="eval/make_reference.py", numpy=np.__version__, scipy=__import__("scipy").__version__, cases=cases, nhanes=nhanes), sys.stdout, indent=0)

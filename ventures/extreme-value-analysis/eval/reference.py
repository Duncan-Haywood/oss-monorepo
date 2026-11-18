"""Reference values for engine.test.mjs, from scipy (an independent implementation).

Run from the repository root:  python3 ventures/extreme-value-analysis/eval/reference.py
It writes eval/reference.json. scipy's genextreme uses c = -xi (Coles's sign is used here).
Declustering is re-implemented below from the runs definition (Coles 2001, 5.3.2), not ported.
"""
import json
import math
import pathlib

import numpy as np
import scipy
from scipy import optimize, stats

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent / "data"
PERIODS = [2, 10, 100, 500]


def read(path, col):
    lines = path.read_text().strip().splitlines()
    head = lines[0].split(",")
    i = head.index(col)
    return [line.split(",") for line in lines[1:]], i


def fit_gev(x):
    best = None
    for c0 in (-0.2, 0.0, 0.2):
        c, loc, scale = stats.genextreme.fit(x, c0, loc=np.mean(x), scale=np.std(x) * 0.78)
        nll = stats.genextreme.nnlf((c, loc, scale), x)
        # Polish with a second optimiser so the reference is as close to the optimum as scipy gets.
        r = optimize.minimize(lambda t: stats.genextreme.nnlf((t[0], t[1], math.exp(t[2])), x), [c, loc, math.log(scale)], method="Nelder-Mead", options={"xatol": 1e-10, "fatol": 1e-12, "maxiter": 20000})
        if r.fun < nll:
            c, loc, scale, nll = r.x[0], r.x[1], math.exp(r.x[2]), r.fun
        if best is None or nll < best["nll"]:
            best = {"mu": loc, "sigma": scale, "xi": -c, "nll": float(nll)}
    best["levels"] = {str(t): float(stats.genextreme.isf(1 / t, -best["xi"], best["mu"], best["sigma"])) for t in PERIODS}
    return best


def fit_gumbel(x):
    loc, scale = stats.gumbel_r.fit(x)
    return {"mu": loc, "sigma": scale, "nll": float(stats.gumbel_r.nnlf((loc, scale), x)), "levels": {str(t): float(stats.gumbel_r.isf(1 / t, loc, scale)) for t in PERIODS}}


def fit_gpd(y):
    c, _, scale = stats.genpareto.fit(y, floc=0)
    r = optimize.minimize(lambda t: stats.genpareto.nnlf((t[0], 0, math.exp(t[1])), y), [c, math.log(scale)], method="Nelder-Mead", options={"xatol": 1e-10, "fatol": 1e-12, "maxiter": 20000})
    nll = stats.genpareto.nnlf((c, 0, scale), y)
    if r.fun < nll:
        c, scale, nll = r.x[0], math.exp(r.x[1]), r.fun
    return {"sigma": scale, "xi": c, "nll": float(nll)}


def runs_decluster(v, u, r):
    peaks, cur, below = [], None, 0
    for x in v:
        if x > u:
            if cur is not None and below < r:
                cur = max(cur, x)
                peaks[-1] = cur
            else:
                cur = x
                peaks.append(x)
            below = 0
        else:
            below += 1
    return peaks


out = {"scipy": scipy.__version__, "numpy": np.__version__, "cases": {}}

rows, i = read(DATA / "potomac-annual-peaks.csv", "peak_cfs")
annual = [float(r[i]) for r in rows]
out["cases"]["potomac_annual"] = {"gev": fit_gev(annual), "gumbel": fit_gumbel(annual), "n": len(annual)}

rows, i = read(DATA / "potomac-daily-flow.csv", "cfs")
daily = [float(r[i]) for r in rows]
dates = [r[0] for r in rows]
wy = {}
for d, v in zip(dates, daily):
    y, m = int(d[:4]), int(d[5:7])
    k = y + (1 if m >= 10 else 0)
    wy[k] = max(wy.get(k, -1), v)
wmax = [wy[k] for k in sorted(wy)]
u = float(np.quantile(daily, 0.98))  # numpy's default linear interpolation, as the engine uses
peaks = runs_decluster(daily, u, 7)
out["cases"]["potomac_daily"] = {"waterYearMaxima": wmax, "gev": fit_gev(wmax), "threshold": u, "runLength": 7, "clusters": len(peaks), "gpd": fit_gpd([p - u for p in peaks])}

rng = np.random.default_rng(20261116)
for name, xi, n in (("synthetic_heavy", 0.25, 60), ("synthetic_bounded", -0.2, 80), ("synthetic_gumbel", 0.0, 150)):
    x = stats.genextreme.rvs(-xi, loc=10, scale=2, size=n, random_state=rng).round(6).tolist()
    out["cases"][name] = {"x": x, "true": {"mu": 10, "sigma": 2, "xi": xi}, "gev": fit_gev(x)}
for name, xi, n in (("synthetic_gpd_heavy", 0.2, 120), ("synthetic_gpd_bounded", -0.25, 120)):
    y = stats.genpareto.rvs(xi, scale=3, size=n, random_state=rng).round(6).tolist()
    out["cases"][name] = {"y": y, "true": {"sigma": 3, "xi": xi}, "gpd": fit_gpd(y)}

(HERE / "reference.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ("gev", "gpd", "clusters", "threshold")} for k, v in out["cases"].items()}, indent=1)[:3000])

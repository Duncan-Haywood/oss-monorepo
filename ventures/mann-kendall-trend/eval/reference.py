"""Independent reference values for engine.test.mjs.

Run from this directory with numpy, scipy and pymannkendall installed:
    python3 eval/reference.py > eval/reference.json
pymannkendall (MIT) and scipy (BSD-3-Clause) are used only here, to produce
numbers; no code from them is in the engine.
"""
import csv, json, sys
import numpy as np
import scipy
from scipy import stats
import pymannkendall as mk

def load(path, value):
    with open(path) as f:
        return [row for row in csv.DictReader(f)]

peaks = [float(r["peak_cfs"]) for r in load("data/potomac-annual-peaks.csv", "peak_cfs")]
monthly = load("data/potomac-monthly-flow.csv", "discharge_cfs")
full = [r for r in monthly if 1931 <= int(r["month"][:4]) <= 2025]
flow = [float(r["discharge_cfs"]) for r in full]
assert len(flow) == 95 * 12

def res(t):
    return {"s": float(t.s), "var_s": float(t.var_s), "z": float(t.z), "p": float(t.p), "slope": float(t.slope), "trend": t.trend}

def yue_wang_ar1(x):
    """Yue & Wang (2004) with rho_k = r1^k, written out here from the paper's formula."""
    x = np.asarray(x, float); n = len(x)
    slope = mk.sens_slope(x).slope
    e = x - np.arange(1, n + 1) * slope
    e = e - e.mean()
    r1 = float(np.sum(e[1:] * e[:-1]) / np.sum(e * e))
    k = np.arange(1, n)
    factor = 1 + 2 * np.sum((1 - k / n) * r1 ** k)
    t = mk.original_test(x)
    var = t.var_s * factor
    z = (t.s - np.sign(t.s)) / np.sqrt(var)
    return {"s": float(t.s), "var_s": float(var), "z": float(z), "p": float(2 * stats.norm.sf(abs(z))), "r1": r1, "factor": float(factor)}

out = {"versions": {"pymannkendall": mk.__version__, "scipy": scipy.__version__, "numpy": np.__version__, "python": sys.version.split()[0]}}
for name, x in [("peaks", peaks), ("monthly", flow)]:
    out[name] = {
        "n": len(x),
        "original": res(mk.original_test(x)),
        "hamed_rao": res(mk.hamed_rao_modification_test(x)),
        "yue_wang_all_lags": res(mk.yue_wang_modification_test(x)),
        "hamed_rao_3": res(mk.hamed_rao_modification_test(x, lag=3)),
        "yue_wang_ar1": yue_wang_ar1(x),
        "tfpw": res(mk.trend_free_pre_whitening_modification_test(x)),
    }
ts = stats.theilslopes(peaks, np.arange(1, len(peaks) + 1), alpha=0.95)
out["peaks"]["theilslopes"] = {"slope": float(ts.slope), "intercept": float(ts.intercept), "low": float(ts.low_slope), "high": float(ts.high_slope)}
ts90 = stats.theilslopes(peaks, np.arange(1, len(peaks) + 1), alpha=0.90)
out["peaks"]["theilslopes90"] = {"low": float(ts90.low_slope), "high": float(ts90.high_slope)}

# Exact p-value for small n, no ties: the first 15 distinct consecutive peaks.
start = next(i for i in range(len(peaks)) if len(set(peaks[i:i + 15])) == 15)
first = peaks[start:start + 15]
kt = stats.kendalltau(np.arange(15), first, method="exact")
out["exact15"] = {"start": start, "values": first, "tau": float(kt.statistic), "p": float(kt.pvalue)}
assert len(set(peaks[60:68])) == 8
kt8 = stats.kendalltau(np.arange(8), peaks[60:68], method="exact")
out["exact8"] = {"values": peaks[60:68], "p": float(kt8.pvalue)}

# Seasonal Kendall on the 95 complete years, by month.
sea = mk.seasonal_test(flow, period=12)
cor = mk.correlated_seasonal_test(flow, period=12)
out["seasonal"] = {"independent": res(sea), "covariance": res(cor)}
M = np.asarray(flow).reshape(95, 12)
z = []
for g in range(12):
    r = mk.original_test(M[:, g])
    z.append(r.s / np.sqrt(r.var_s))
z = np.asarray(z)
chi_total = float(np.sum(z ** 2)); chi_trend = float(12 * z.mean() ** 2)
out["seasonal"]["homogeneity"] = {"chi2": chi_total - chi_trend, "df": 11, "p": float(stats.chi2.sf(chi_total - chi_trend, 11))}

# Special functions.
out["special"] = {
    "norm_sf": [[q, float(stats.norm.sf(q))] for q in [0.1, 1.0, 1.96, 3.5, 8.0, 20.0, -2.5]],
    "norm_ppf": [[p, float(stats.norm.ppf(p))] for p in [1e-10, 0.001, 0.025, 0.3, 0.975, 0.9999]],
    "chi2_sf": [[x, d, float(stats.chi2.sf(x, d))] for x, d in [(7.4, 11), (30.0, 11), (0.5, 1), (100.0, 3)]],
}
json.dump(out, sys.stdout, indent=1)
print()

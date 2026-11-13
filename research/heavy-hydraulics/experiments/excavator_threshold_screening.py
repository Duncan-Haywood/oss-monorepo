"""Milestone 6d: a two-number screening rule for the excavator's break-even rest-of-machine fuel rate.

Reads only 6c's committed per-case table (excavator_breakeven_geometry_cases.csv); no data host.
Fits ln f_t,max (central parameters) on ln(r219 - 1) [and ln(p99/mean)], with 16-fold grouped
cross-validation by (boom, arm) lever pair, and grades predictions E1 to E5 (LOG.md, 6d).
Stdlib only. Usage: python3 excavator_threshold_screening.py > excavator_threshold_screening_results.txt
"""
import csv
import math
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from heavy_hydraulics.screening import ols, r_squared, grouped_cv, predict  # noqa: E402

LOW = 1.48  # loader's lowest measured fuel rate, L/h (5x), borrowed as in 6b/6c

rows = list(csv.DictReader(open(HERE / "excavator_breakeven_geometry_cases.csv")))
f = [float(r["ft_max_central_lph"]) for r in rows]
y = [math.log(v) for v in f]
x_r = [math.log(float(r["r_at_219"]) - 1.0) for r in rows]
x_p = [math.log(float(r["p99_over_mean"])) for r in rows]
groups = [(r["boom_lever"], r["arm_lever"]) for r in rows]
fmin = [float(r["ft_max_sweep_min_lph"]) for r in rows]
fmax = [float(r["ft_max_sweep_max_lph"]) for r in rows]
swing = [r["swing_share"] for r in rows]
n = len(rows)


def pct(v, q):
    s = sorted(v)
    k = (len(s) - 1) * q
    lo = math.floor(k)
    return s[lo] + (s[min(lo + 1, len(s) - 1)] - s[lo]) * (k - lo)


def report(name, feats):
    coef = ols(feats, y)
    r2 = r_squared(coef, feats, y)
    cv = grouped_cv(feats, y, groups)
    err = [abs(math.exp(c) / v - 1.0) for c, v in zip(cv, f)]
    calls = sum((math.exp(c) > LOW) == (v > LOW) for c, v in zip(cv, f))
    fp = sum(math.exp(c) > LOW >= v for c, v in zip(cv, f))
    fn = sum(math.exp(c) <= LOW < v for c, v in zip(cv, f))
    print(f"{name}")
    print("  coefficients (intercept, slopes): " + ", ".join(f"{c:+.4f}" for c in coef))
    print(f"  in-sample R^2 on ln f_t,max: {r2:.3f}")
    print(f"  grouped CV (16 folds by boom/arm lever pair) relative error: median {st.median(err):.3f}, "
          f"p90 {pct(err, 0.9):.3f}, max {max(err):.3f}")
    print(f"  1.48 L/h call right (CV): {calls}/{n} = {100 * calls / n:.1f}%  "
          f"(says fixed wins wrongly {fp}, misses a fixed win {fn})")
    for s in ("0", "0.5", "1"):
        idx = [i for i in range(n) if swing[i] == s]
        e = [err[i] for i in idx]
        print(f"    swing share {s}: median CV error {st.median(e):.3f}, max {max(e):.3f}")
    return coef, r2, st.median(err), calls / n


print("Milestone 6d: screening rule for the excavator break-even rest-of-machine fuel rate")
print("(input: 6c's excavator_breakeven_geometry_cases.csv, 384 geometry cases, central parameters)")
print(f"cases {n}; f_t,max median {st.median(f):.3f} L/h; Spearman inputs as 6c\n")
c1, r2_1, e1, k1 = report("Rule A: ln f_t,max ~ ln(r219 - 1)", [(a,) for a in x_r])
print()
c2, r2_2, e2, k2 = report("Rule B: ln f_t,max ~ ln(r219 - 1) + ln(p99/mean)", list(zip(x_r, x_p)))
print()
swing_d = [(1.0 if s == "0" else 0.0) for s in swing]
c3, r2_3, e3, k3 = report("Rule C (not registered, added after B): Rule B + indicator swing share 0",
                          list(zip(x_r, x_p, swing_d)))
print()

print("Rule B in a builder's units (full sample fit): f_t,max ~ "
      f"{math.exp(c2[0]):.3f} x (r219 - 1)^{c2[1]:+.3f} x (p99/mean)^{c2[2]:+.3f} L/h")
for r219, pk in ((1.8, 2.4), (2.175, 2.376), (2.5, 2.5), (3.0, 2.8)):
    v = math.exp(predict(c2, (math.log(r219 - 1), math.log(pk))))
    print(f"  r219 {r219:.3f}, p99/mean {pk:.3f}: {v:.3f} L/h")
print()

print("Decision curve: share of the 384 cases in which a smaller fixed pump beats load-sensing")
print(" f_t_lph  every_set_pct  central_pct  some_set_pct")
for ft in (0.25, 0.5, 0.75, 1.0, 1.25, 1.48, 1.75, 2.0, 2.5, 3.0, 4.0, 5.15, 6.0):
    a = 100 * sum(v > ft for v in fmin) / n
    b = 100 * sum(v > ft for v in f) / n
    c = 100 * sum(v > ft for v in fmax) / n
    print(f"  {ft:5.2f}  {a:12.1f}  {b:11.1f}  {c:12.1f}")
all_low = 100 * sum(v > LOW for v in fmin) / n
some_low = 100 * sum(v > LOW for v in fmax) / n
print()

print("Spread from parameters against spread from geometry")
spread = [b / a for a, b in zip(fmin, fmax)]
cen = [i for i, r in enumerate(rows) if (r["boom_lever"], r["arm_lever"], r["bucket_lever"], r["bucket_sign"],
                                           r["swing_share"]) == ("1", "1", "1", "1", "0.5")][0]
print(f"  central geometry, 108 parameter sets: f_t,max {fmin[cen]:.2f} to {fmax[cen]:.2f} L/h (x{spread[cen]:.2f})")
print(f"  central parameters, 384 geometries: f_t,max {min(f):.2f} to {max(f):.2f} L/h (x{max(f) / min(f):.2f})")
print(f"  per-case max/min over the 108 sets: median x{st.median(spread):.2f}, range x{min(spread):.2f} to x{max(spread):.2f}")
print()

print("Predictions (LOG.md 6d):")
print(f"  E1 Rule A in-sample R^2 > 0.5: {'held' if r2_1 > 0.5 else 'refuted'} ({r2_1:.3f})")
print(f"  E2 Rule B grouped-CV median relative error < 15%: {'held' if e2 < 0.15 else 'refuted'} ({100 * e2:.1f}%)")
print(f"  E3 Rule B right on the 1.48 L/h call in >= 90%: {'held' if k2 >= 0.9 else 'refuted'} ({100 * k2:.1f}%)")
print(f"  E4 < 5% of cases win under all 108 sets at 1.48: {'held' if all_low < 5 else 'refuted'} ({all_low:.1f}%)")
print(f"  E5 > 50% of cases win under some set at 1.48: {'held' if some_low > 50 else 'refuted'} ({some_low:.1f}%)")

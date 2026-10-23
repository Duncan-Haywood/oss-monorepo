"""Out-of-sample test of a residual-load price model on German day-ahead prices 2015-2019.

    PYTHONPATH=src:../energy-thermal-real/src python experiments/run.py   > experiments/results.txt

Models, each fitted on the training years only:
  const   training-years mean price
  merit   the one-fuel merit-order price of energy-thermal-hourly with today's fleet: flat EUR 54.6/MWh
  hour    mean price by hour of day (UTC)
  resid   isotonic (non-decreasing) price against residual load = load - solar - onshore wind
  resid+  resid with the test year's mean price added back (an oracle level, not a forecast): isolates shape from level
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "energy-thermal-real" / "src"))
from energy_price_residual import (isotonic_fit, predict, rmse, cheapest_quarter_mean, load_year_rows, YEARS)  # noqa: E402
from energy_thermal_real import pearson, negative_hours  # noqa: E402

MERIT = 54.6  # EUR/MWh, energy-thermal-hourly gas marginal cost (no surplus hour => flat)
ROWS = {y: load_year_rows(y) for y in YEARS}


def mean(v):
    return sum(v) / len(v)


def evaluate(train, test):
    tr = [r for y in train for r in ROWS[y]]
    te = ROWS[test]
    actual = [r[1] for r in te]
    fit = isotonic_fit([r[0] for r in tr], [r[1] for r in tr])
    hours = [[] for _ in range(24)]
    for r in tr:
        hours[r[2]].append(r[1])
    hmean = [mean(h) for h in hours]
    resid = [predict(fit, r[0]) for r in te]
    shift = mean(actual) - mean(resid)
    preds = {
        "const": [mean([r[1] for r in tr])] * len(te),
        "merit": [MERIT] * len(te),
        "hour": [hmean[r[2]] for r in te],
        "resid": resid,
        "resid+": [p + shift for p in resid],
    }
    out = {}
    for name, p in preds.items():
        flat = max(p) == min(p)
        out[name] = (mean(p), rmse(p, actual), None if flat else pearson(p, actual),
                     cheapest_quarter_mean(p), sum(1 for v in p if v < 0))
    return out, mean(actual), cheapest_quarter_mean(actual), negative_hours(actual)


def block(title, train, test):
    res, am, aq, an = evaluate(train, test)
    print(f"{title}: train {train[0]}-{train[-1]} ({len(train)} y), test {test}; actual mean {am:.1f}, "
          f"cheapest-quarter mean {aq:.1f} EUR/MWh, {an} negative hours")
    print(f"{'model':8s} {'mean':>7s} {'RMSE':>7s} {'corr':>7s} {'cheap25':>8s} {'cheap25err':>10s} {'neg_h':>6s}")
    for name, (m, e, c, q, n) in res.items():
        cs = "  n/a" if c is None else f"{c:7.3f}"
        print(f"{name:8s} {m:7.1f} {e:7.1f} {cs:>7s} {q:8.1f} {q - aq:10.1f} {n:6d}")
    print()
    return res


print("A. Chronological: fit 2015-2018, test 2019 (EUR/MWh)")
block("A", list(YEARS[:-1]), 2019)

print("B. Leave one year out (fit on the other four)")
summary = {}
for t in YEARS:
    res = block(f"B{t}", [y for y in YEARS if y != t], t)
    summary[t] = res

print("C. Leave-one-year-out summary: RMSE | corr | cheapest-quarter error (EUR/MWh)")
print(f"{'year':6s}" + "".join(f"{n:>26s}" for n in ("const", "merit", "hour", "resid", "resid+")))
for t in YEARS:
    cells = []
    for n in ("const", "merit", "hour", "resid", "resid+"):
        m, e, c, q, nh = summary[t][n]
        aq = cheapest_quarter_mean([r[1] for r in ROWS[t]])
        cells.append(f"{e:6.1f} {('  n/a' if c is None else f'{c:5.2f}')} {q - aq:+7.1f}   ")
    print(f"{t:<6d}" + "".join(f"{c:>26s}" for c in cells))
print()
print("D. In-sample ceiling (fit and test on the same year, resid): RMSE, corr")
for t in YEARS:
    fit = isotonic_fit([r[0] for r in ROWS[t]], [r[1] for r in ROWS[t]])
    p = [predict(fit, r[0]) for r in ROWS[t]]
    a = [r[1] for r in ROWS[t]]
    print(f"{t}  {rmse(p, a):6.1f}  {pearson(p, a):5.2f}")
print()
print("E. Residual load and price by year")
print(f"{'year':6s}{'res_mean_GW':>12s}{'res_min_GW':>11s}{'price_mean':>11s}{'corr(res,price)':>16s}")
for t in YEARS:
    rs = [r[0] for r in ROWS[t]]
    ps = [r[1] for r in ROWS[t]]
    print(f"{t:<6d}{mean(rs)/1000:12.1f}{min(rs)/1000:11.1f}{mean(ps):11.1f}{pearson(rs, ps):16.3f}")
print()
print("F. Leave-one-year-out RMSE by year (EUR/MWh)")
print(f"{'year':6s}" + "".join(f"{n:>8s}" for n in ("const", "merit", "hour", "resid", "resid+")))
for t in YEARS:
    print(f"{t:<6d}" + "".join(f"{summary[t][n][1]:8.1f}" for n in ("const", "merit", "hour", "resid", "resid+")))

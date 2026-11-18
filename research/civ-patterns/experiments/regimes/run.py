"""How long do political regimes last, does the risk of ending fall with age, and can a duration
model forecast which regimes end in the next ten years? Polity5 regime spells, 1800-2018.

    python3 experiments/regimes/run.py          # downloads Polity5 once (not redistributed)

Writes experiments/regimes/results.txt and forecast_2018.csv. Plan and hypotheses: LOG.md.
"""
import csv
import sys
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from civ_patterns import regimes as R  # noqa: E402
from civ_patterns import survival as sv  # noqa: E402

H = 10.0
CUTOFFS = (1966.0, 1976.0, 1986.0, 1996.0, 2006.0)


def arrays(sp):
    t = np.array([s["end"] - s["start"] for s in sp])
    e = np.array([s["event"] for s in sp])
    return t, e


class Piecewise:
    """Adapter so the piecewise-hazard model forecasts like the Weibull fits."""

    def __init__(self, train, by_type, since=None):
        """since: only count time at risk after this calendar year (recent-window estimate)."""
        if since is not None:
            train = [s for s in train if s["end"] > since]
        t, e = arrays(train)
        entry = None if since is None else np.array([max(0.0, since - s["start"]) for s in train])
        self.by_type = by_type
        self.m = sv.PiecewiseHazard().fit(t, e, [s["type"] for s in train] if by_type else None, entry)

    def predict(self, test, ages):
        return self.m.prob_end_within(ages, H, [s["type"] for s in test] if self.by_type else None)


def models(train, cutoff):
    t, e = arrays(train)
    X = R.covariates(train)
    return {
        "piecewise": (Piecewise(train, False), None),
        "piecewise+type": (Piecewise(train, True), None),
        "piecewise+type,40y": (Piecewise(train, True, since=cutoff - 40), None),
        "exponential": (sv.fit_weibull(t, e, shape=1.0), False),
        "weibull": (sv.fit_weibull(t, e), False),
        "exponential+type": (sv.fit_weibull(t, e, X=X, shape=1.0), True),
        "weibull+type": (sv.fit_weibull(t, e, X=X), True),
    }


def main():
    sp = R.load()
    lines = []
    p = lines.append
    full = [s for s in sp if not s["left_truncated"]]
    p(f"Polity5 p5v2018d: {len(sp)} regime spells (gaps -66/-77/-88 removed); "
      f"{len(sp) - len(full)} already running in 1800 dropped (age unknown); {len(full)} used, "
      f"{sum(s['event'] for s in full)} ended by 2018, {sum(1 - s['event'] for s in full)} still in place.")
    p("")

    # 1. Durations by type (check against Gates et al. 2006).
    p("## 1. Median duration by regime type (Kaplan-Meier, years; censored at end of 2018)")
    for ty in R.TYPES:
        g = [s for s in full if s["type"] == ty]
        t, e = arrays(g)
        p(f"{ty:10s} n={len(g):4d} ended={int(e.sum()):4d} KM median={sv.km_median(t, e):5.1f} "
          f"share lasting 20+ years={np.mean(t >= 20):.2f} (of all, incl. censored young ones)")
    t, e = arrays(full)
    p(f"{'all':10s} n={len(full):4d} ended={int(e.sum()):4d} KM median={sv.km_median(t, e):5.1f}")
    p("")

    # 2. Does the hazard fall with age? Weibull shape k < 1 means yes.
    p("## 2. Weibull shape k (k < 1: the older a regime, the lower its yearly risk of ending)")
    for ty in R.TYPES + ("all",):
        g = full if ty == "all" else [s for s in full if s["type"] == ty]
        t, e = arrays(g)
        fw = sv.fit_weibull(t, e)
        fe = sv.fit_weibull(t, e, shape=1.0)
        lo, hi = sv.shape_ci(fw)
        p(f"{ty:10s} k={fw['k']:.3f} [{lo:.3f}, {hi:.3f}]  median={sv.weibull_median(fw):5.1f}y  "
          f"AIC weibull {fw['aic']:.1f} vs exponential {fe['aic']:.1f}")
    # Empirical yearly hazard by age band.
    p("Empirical yearly hazard by age band (events / regime-years at risk), all types:")
    for a0, a1 in ((0, 2), (2, 5), (5, 10), (10, 20), (20, 40), (40, 80), (80, 220)):
        ev = sum(1 for s in full if s["event"] and a0 <= s["end"] - s["start"] < a1)
        expo = sum(max(0.0, min(s["end"] - s["start"], a1) - a0) for s in full)
        p(f"  age {a0:3d}-{a1:<3d} years: {ev:4d} ends / {expo:8.0f} regime-years = {ev / expo:.3f} per year")
    fw = sv.fit_weibull(t, e, X=R.covariates(full))
    b = fw["beta"]; se = np.sqrt(np.diag(fw["cov"]))[2:]
    p(f"Weibull+type, all spells: k={fw['k']:.3f}; hazard ratio vs democracy: anocracy "
      f"{np.exp(b[0]):.2f} [{np.exp(b[0] - 1.96 * se[0]):.2f}, {np.exp(b[0] + 1.96 * se[0]):.2f}], "
      f"autocracy {np.exp(b[1]):.2f} [{np.exp(b[1] - 1.96 * se[1]):.2f}, {np.exp(b[1] + 1.96 * se[1]):.2f}]")
    p("")

    # 3. Out-of-sample backtest: fit on what was known at the cutoff, forecast the next 10 years.
    p(f"## 3. Backtest: P(regime ends within {H:.0f} years), fit only on data before each cutoff")
    p("Brier (lower is better), log loss, AUC; base rate = share of regimes in place that ended.")
    pooled = {}
    for c in CUTOFFS:
        train = R.window(sp, c)
        test = R.alive_at(sp, c)
        y = np.array([1 if s["event"] and s["end"] < c + H else 0 for s in test])
        ages = np.array([s["age"] for s in test])
        Xt = R.covariates(test)
        # Naive baseline: the training share of regimes that ended within H years of any year.
        ms = models(train, c)
        p(f"cutoff {c:.0f}: {len(test)} regimes in place, {y.sum()} ended by {c + H:.0f} "
          f"(base rate {y.mean():.2f}); trained on {len(train)} spells")
        for name, (fit, uses_x) in ms.items():
            pr = fit.predict(test, ages) if uses_x is None else sv.prob_end_within(fit, ages, H, Xt if uses_x else None)
            pooled.setdefault(name, []).append((pr, y))
            p(f"   {name:18s} Brier {sv.brier(pr, y):.3f}  logloss {sv.log_loss(pr, y):.3f}  "
              f"AUC {sv.auc(pr, y):.3f}  mean forecast {pr.mean():.2f}")
    p("Pooled over cutoffs:")
    Y = np.concatenate([y for _, y in pooled["exponential"]])
    P = {k: np.concatenate([pr for pr, _ in v]) for k, v in pooled.items()}
    for k, pr in P.items():
        p(f"   {k:18s} Brier {sv.brier(pr, Y):.3f}  logloss {sv.log_loss(pr, Y):.3f}  AUC {sv.auc(pr, Y):.3f}")
    lo, hi = sv.bootstrap_diff(P["weibull+type"], P["exponential"], Y)
    p(f"   Brier(weibull+type) - Brier(exponential): {sv.brier(P['weibull+type'], Y) - sv.brier(P['exponential'], Y):+.4f} "
      f"95% bootstrap [{lo:+.4f}, {hi:+.4f}] (units resampled, n={len(Y)}; units repeat across cutoffs)")
    for other in ("piecewise", "piecewise+type", "piecewise+type,40y"):
        lo, hi = sv.bootstrap_diff(P[other], P["weibull+type"], Y)
        p(f"   Brier({other}) - Brier(weibull+type): {sv.brier(P[other], Y) - sv.brier(P['weibull+type'], Y):+.4f} "
          f"95% bootstrap [{lo:+.4f}, {hi:+.4f}]")
    lo, hi = sv.bootstrap_diff(P["weibull+type"], P["exponential+type"], Y)
    p(f"   Brier(weibull+type) - Brier(exponential+type): {sv.brier(P['weibull+type'], Y) - sv.brier(P['exponential+type'], Y):+.4f} "
      f"95% bootstrap [{lo:+.4f}, {hi:+.4f}]")
    # Calibration of the best model by forecast quintile.
    for cal in ("weibull+type", "piecewise+type", "piecewise+type,40y"):
      pr = P[cal]
      q = np.quantile(pr, [0, .2, .4, .6, .8, 1])
      p(f"   Calibration of {cal} by forecast quintile (mean forecast -> observed share):")
      for i in range(5):
        m = (pr >= q[i]) & (pr <= q[i + 1]) if i == 4 else (pr >= q[i]) & (pr < q[i + 1])
        p(f"     {pr[m].mean():.2f} -> {Y[m].mean():.2f} (n={m.sum()})")
    p("")

    # 4. Forecast from the end of the data (2018) to 2028, fit on everything.
    p("## 4. Forecast from 31 Dec 2018: P(regime spell ends by end of 2028), fit on all spells")
    t, e = arrays(full)
    fit = sv.fit_weibull(t, e, X=R.covariates(full))
    now = [s for s in R.alive_at(sp, R.DATA_END - 1e-6)]
    ages = np.array([s["age"] for s in now])
    pw = Piecewise(full, True)
    pr = pw.predict(now, ages)
    prw = sv.prob_end_within(fit, ages, H, R.covariates(now))
    pr40 = Piecewise(full, True, since=R.DATA_END - 40).predict(now, ages)
    p("piecewise+type yearly hazard by age band (bands 0-2-5-10-20-40-80-inf years):")
    for ty in R.TYPES:
        p(f"   {ty:10s} " + " ".join(f"{x:.3f}" for x in pw.m.rates[ty]))
    order = np.argsort(-pr)
    rows = []
    for i in order:
        s = now[i]
        rows.append({"country": s["country"], "type": s["type"], "polity": s["polity"],
                     "regime_began": round(s["start"], 2), "age_2018": round(s["age"], 1),
                     "p_end_by_2028": round(float(pr[i]), 3),
                     "p_end_by_2028_weibull": round(float(prw[i]), 3),
                     "p_end_by_2028_recent40y": round(float(pr40[i]), 3)})
    with open(HERE / "forecast_2018.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader(); w.writerows(rows)
    p(f"{len(now)} regimes in place at the end of 2018 (spells begun after 1800); expected number ending "
      f"by 2028: {pr.sum():.0f} ({pr.mean():.2f} of them) under piecewise+type, {prw.sum():.0f} under weibull+type, {pr40.sum():.0f} under piecewise+type fitted on 1979-2018 only.")
    by = Counter(s["type"] for s in now)
    for ty in R.TYPES:
        m = np.array([s["type"] == ty for s in now])
        p(f"   {ty:10s} n={by[ty]:3d}  mean P(end by 2028)={pr[m].mean():.2f}  median age {np.median(ages[m]):.0f}y")
    p("Highest ten (piecewise+type):")
    for r in rows[:10]:
        p(f"   {r['country']:24s} {r['type']:10s} polity {r['polity']:3d} since {r['regime_began']:.0f}  P={r['p_end_by_2028']:.2f}")
    p("Lowest ten:")
    for r in rows[-10:]:
        p(f"   {r['country']:24s} {r['type']:10s} polity {r['polity']:3d} since {r['regime_began']:.0f}  P={r['p_end_by_2028']:.2f}")
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()

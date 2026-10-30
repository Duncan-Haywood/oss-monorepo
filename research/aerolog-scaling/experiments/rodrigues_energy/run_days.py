"""Milestone 6b: does the mass exponent of run.py survive day-level confounding?

Reuses run.py's per-flight table. Two checks: (a) cluster bootstrap resampling flight DAYS, (b) date
fixed effects (a dummy per flight day), identified only from days with more than one payload.

Usage: python3 run_days.py [dir holding parameters.csv and flights.csv]
"""
import sys

import numpy as np

import run

SEED, NBOOT = 1, 10000


def fe_fit(d):
    """OLS of ln P on ln m, speed, speed^2, wind and one dummy per date (first date dropped)."""
    x, y, _ = run.design(d)
    dates = sorted(d.date.unique())
    dm = np.column_stack([(d.date.values == t).astype(float) for t in dates[1:]]) if len(dates) > 1 else np.empty((len(d), 0))
    xx = np.column_stack([x, dm])
    b, *_ = np.linalg.lstsq(xx, y, rcond=None)
    return b[1]


def cluster_boot(d, fit):
    rng = np.random.default_rng(SEED)
    groups = {t: g for t, g in d.groupby("date")}
    keys = list(groups)
    out = []
    import pandas as pd
    for _ in range(NBOOT):
        pick = rng.choice(len(keys), len(keys))
        s = pd.concat([groups[keys[i]].assign(date=f"{keys[i]}#{j}") for j, i in enumerate(pick)])
        out.append(fit(s))
    return np.array(out)


def main(root):
    root = run.fetch(root)
    d = run.per_flight(root)
    sizes = d.groupby("date").size()
    print(f"flights {len(d)}, days {len(sizes)}; flights per day min {sizes.min()}, median {int(sizes.median())}, max {sizes.max()}")
    pay = d.groupby("date").payload.nunique()
    print(f"days with >1 payload: {(pay > 1).sum()} of {len(pay)}; flights on those days {int(sizes[pay > 1].sum())}")
    plain = lambda s: run.fit(s)[1]
    b = plain(d)
    bs = cluster_boot(d, plain)
    lo, hi = np.percentile(bs, [2.5, 97.5])
    print(f"[cluster bootstrap over days] mass exponent {b:.3f}  95% CI [{lo:.3f}, {hi:.3f}] (width {hi - lo:.3f}); 1.5 inside: {lo <= 1.5 <= hi}")
    fe = fe_fit(d)
    # FE with flight bootstrap restricted to multi-payload days is the clean contrast
    m = d[d.date.isin(pay[pay > 1].index)]
    fe_m = fe_fit(m)
    rng = np.random.default_rng(SEED)
    idx = np.arange(len(m))
    bf = np.array([fe_fit(m.iloc[rng.choice(idx, len(m))]) for _ in range(NBOOT)])
    flo, fhi = np.percentile(bf, [2.5, 97.5])
    print(f"[date fixed effects, all flights] mass exponent {fe:.3f}")
    print(f"[date fixed effects, multi-payload days n={len(m)}] {fe_m:.3f}  95% flight-bootstrap CI [{flo:.3f}, {fhi:.3f}]; 1.5 inside: {flo <= 1.5 <= fhi}")
    bc = cluster_boot(m, fe_fit)
    clo, chi = np.percentile(bc, [2.5, 97.5])
    print(f"[date FE, multi-payload days, cluster bootstrap over days] {fe_m:.3f}  95% CI [{clo:.3f}, {chi:.3f}]")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data")

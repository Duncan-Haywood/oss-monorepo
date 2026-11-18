#!/usr/bin/env python3
"""Milestone 3 (part): does a period-aware mixture (DPMPM with the survey period as a variable) recover a
held-out ballot better than the year-free one?

    python3 experiments/m3_period_mixture/run.py [--period decade|half] [--K 80] [--burn 400] [--thin 30] [--m 10]

Identical to experiments/m3_mixture/run.py (Catholics, 13 items, every survey year asked of >= 150
respondents held out in turn, Si and Reiter's DPMPM from src/dpmpm.py, Rubin's rules, the
Rao-Blackwellised share) except for one added categorical variable: the respondent's survey period,
`decade` (1970s ... 2020s) or `half` (five-year bins, 1972-74, 1975-79, ...). The period is observed for
every respondent, including the held-out year's, so latent classes can become period-specific and the
held-out year's respondents can borrow the item's answers from same-period respondents in other years
whose ballot asked it. The exact year is still not a variable. Writes results/period_mixture_<period>.csv.
Plan and predictions: LOG.md, 2026-11-12.
"""
import argparse, importlib.util, sys, time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m3_mixture_run', HERE.parent / 'm3_mixture' / 'run.py')
base = importlib.util.module_from_spec(_sp); sys.modules['m3_mixture_run'] = base; _sp.loader.exec_module(base)
gss, DPMPM = base.gss, base.DPMPM
OUT = HERE / 'results'


def period_code(year, kind):
    """Integer period codes from 0 for the survey years given (decade or five-year bins)."""
    year = np.asarray(year, dtype=int)
    width = 10 if kind == 'decade' else 5
    b = (year // width) * width
    vals = np.sort(np.unique(b))
    return np.searchsorted(vals, b), len(vals)


def one(args):
    g, yr, m, burn, thin, K, kind = args
    t0 = time.time()
    df = base.DATA[base.DATA[g].notna()].reset_index(drop=True)
    te = (df.year == yr).values
    feats = [f for f in gss.features_for(g) if f != 'year' and df.loc[~te, f].notna().any()]
    X, L = base.code(df, feats)
    pc, npc = period_code(df.year.values, kind)
    y = df[g].values.astype(np.int64)
    if npc >= 2:
        X, L = np.column_stack([X, pc]), np.append(L, npc)
    Xy = np.column_stack([X, np.where(te, -1, y)])
    Ly = np.append(L, 2)
    wt, rows = df.w.values[te], np.where(te)[0]
    obs = np.average(y[te], weights=wt)
    mod = DPMPM(Xy, Ly, K=K, seed=1000 * yr + len(g))  # same seeds as m3_mixture
    for _ in range(burn):
        mod.step()
    qs, us, rb, occ = [], [], [], []
    for _ in range(m):
        for _ in range(thin):
            mod.step()
        yi = mod.impute(rows, Xy.shape[1] - 1).astype(float)
        q, u = base.wmean_var(yi, wt); qs.append(q); us.append(u)
        rb.append(np.average(mod.posterior_prob(rows, Xy.shape[1] - 1)[:, 1], weights=wt))
        occ.append(mod.occupied())
    Q, se, sb = base.rubin(qs, us)
    # How period-specific did the classes become? Weighted share of the held-out year's respondents'
    # class mass that sits in classes whose members are mostly (> 50%) from the same period.
    z = mod.z
    same = np.zeros(K)
    for k in np.unique(z):
        same[k] = np.mean(pc[z == k] == pc[te][0])
    return dict(target=g, year=int(yr), period=kind, n=int(te.sum()), observed=obs, m=m, K=K, J=Xy.shape[1],
                pmix=Q, pmix_se=se, pmix_sd_between=sb, pmix_covers=int(abs(Q - obs) <= 1.96 * se),
                pmix_rb=float(np.mean(rb)), occupied_mean=float(np.mean(occ)), occupied_max=int(max(occ)),
                same_period_class_share=float(np.average(same[z[rows]] > 0.5, weights=wt)),
                alpha=float(mod.alpha), seconds=round(time.time() - t0, 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--period', choices=['decade', 'half'], default='decade')
    ap.add_argument('--m', type=int, default=10)
    ap.add_argument('--burn', type=int, default=400)
    ap.add_argument('--thin', type=int, default=30)
    ap.add_argument('--K', type=int, default=80)
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--items', nargs='*')
    ap.add_argument('--years', nargs='*', type=int)
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    base.init()
    tasks = [t + (a.period,) for t in base.tasks_for(a.items or (list(gss.TARGETS) + list(gss.CATHOLIC_ONLY)),
                                                     a.m, a.burn, a.thin, a.K)]
    if a.years:
        tasks = [t for t in tasks if t[1] in a.years]
    tasks.sort(key=lambda t: -int(base.DATA[t[0]].notna().sum()))
    out = OUT / f'period_mixture_{a.period}.csv'
    print(len(tasks), 'item-years', flush=True)
    rows = []
    with ProcessPoolExecutor(a.jobs, initializer=base.init) as ex:
        for i, r in enumerate(ex.map(one, tasks)):
            rows.append(r)
            if i % 10 == 0:
                print(i, r['target'], r['year'], r['seconds'], 's', flush=True)
                pd.DataFrame(rows).to_csv(out, index=False)
    pd.DataFrame(rows).sort_values(['target', 'year']).to_csv(out, index=False)
    print('done', flush=True)


if __name__ == '__main__':
    main()

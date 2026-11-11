#!/usr/bin/env python3
"""Milestone 3 (part): does Bayesian mixture imputation (DPMPM) recover a held-out ballot?

    python3 experiments/m3_mixture/run.py [--m 10] [--burn 500] [--thin 50] [--K 30] [--jobs 4]

Same held-out-year design as m3_year_holdout and m3_mice (Catholics; for each item and each survey
year asked of >= 150 respondents, the year's answers to the item are removed and imputed from all
other years; `year` is not a variable). The imputation model is the one milestone 3 of PROPOSAL.md
names as its strongest principled baseline: the truncated Dirichlet-process mixture of product
multinomials of Si and Reiter (2013), src/dpmpm.py. Every variable enters as categorical: the raw
GSS item codes as they are, numeric demographics binned (`code()`). The target (binary) is one more
variable, missing for the held-out year. Missing features need no imputation step: the sampler
conditions on observed cells.

After `burn` Gibbs sweeps, m imputations are taken `thin` sweeps apart. For each, the held-out
respondents' target is drawn from phi[z_i] and its weighted share computed (survey weight wtssps; the
mixture itself is unweighted, as in Si and Reiter). Rubin's rules (Kish effective n for U) give the
interval, as in m3_mice. Also kept: `dpmpm_rb`, the Rao-Blackwellised share (mean over draws of the
weighted mean of p(y = 1 | x_obs)), and the number of occupied classes (a check on the truncation K).
Writes results/mixture.csv. Plan and predictions: LOG.md, 2026-11-11 (mixture entry).
"""
import argparse, sys, time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'src'))
import gss  # noqa: E402
from dpmpm import DPMPM  # noqa: E402

OUT = Path(__file__).resolve().parent / 'results'
MIN_N, MIN_YEAR = 300, 150  # as m3_mice / m3_year_holdout

# Numeric features binned for the mixture (edges are right-open; NaN stays missing).
BINS = {
    'age': [30, 40, 50, 60, 70],          # 18-29, 30s, 40s, 50s, 60s, 70+
    'educ': [12, 13, 16, 17],              # <12, 12, 13-15, 16, 17+ years
    'childs': [1, 2, 3, 4],                # 0, 1, 2, 3, 4+
}


def code(df, feats):
    """(N, J) int codes (-1 missing) and levels per column, for the given feature columns."""
    cols, levels = [], []
    for f in feats:
        x = df[f].astype(float)
        if f in BINS:
            c = np.where(x.isna(), -1, np.digitize(x.fillna(0), BINS[f]))
            L = len(BINS[f]) + 1
        elif f == 'log_realinc':
            q = np.nanquantile(x, [0.2, 0.4, 0.6, 0.8])
            c = np.where(x.isna(), -1, np.digitize(x.fillna(0), q))
            L = 5
        else:
            vals = np.sort(x.dropna().unique())
            m = {v: i for i, v in enumerate(vals)}
            c = np.array([m[v] if v == v else -1 for v in x.values])
            L = len(vals)
        if L < 2:
            continue
        cols.append(c); levels.append(L)
    return np.column_stack(cols).astype(np.int64), np.array(levels)


def wmean_var(v, w):
    q = np.average(v, weights=w)
    neff = w.sum() ** 2 / (w ** 2).sum()
    return q, np.average((v - q) ** 2, weights=w) / neff


def rubin(qs, us):
    qs, us = np.asarray(qs), np.asarray(us)
    m = len(qs)
    T = us.mean() + (1 + 1 / m) * qs.var(ddof=1)
    return qs.mean(), np.sqrt(T), qs.std(ddof=1)


def one(args):
    g, yr, m, burn, thin, K = args
    t0 = time.time()
    df = DATA[DATA[g].notna()].reset_index(drop=True)
    te = (df.year == yr).values
    feats = [f for f in gss.features_for(g) if f != 'year' and df.loc[~te, f].notna().any()]
    X, L = code(df, feats)
    y = df[g].values.astype(np.int64)
    Xy = np.column_stack([X, np.where(te, -1, y)])
    Ly = np.append(L, 2)
    w = df.w.values
    wt, rows = w[te], np.where(te)[0]
    obs = np.average(y[te], weights=wt)
    mod = DPMPM(Xy, Ly, K=K, seed=1000 * yr + len(g))
    for _ in range(burn):
        mod.step()
    qs, us, rb, occ = [], [], [], []
    for _ in range(m):
        for _ in range(thin):
            mod.step()
        yi = mod.impute(rows, Xy.shape[1] - 1).astype(float)
        q, u = wmean_var(yi, wt); qs.append(q); us.append(u)
        rb.append(np.average(mod.posterior_prob(rows, Xy.shape[1] - 1)[:, 1], weights=wt))
        occ.append(mod.occupied())
    Q, se, sb = rubin(qs, us)
    return dict(target=g, year=int(yr), n=int(te.sum()), observed=obs, m=m, K=K, J=Xy.shape[1],
                dpmpm=Q, dpmpm_se=se, dpmpm_sd_between=sb, dpmpm_covers=int(abs(Q - obs) <= 1.96 * se),
                dpmpm_rb=float(np.mean(rb)), occupied_mean=float(np.mean(occ)), occupied_max=int(max(occ)),
                alpha=float(mod.alpha), seconds=round(time.time() - t0, 1))


DATA = None


def init():
    global DATA
    d = gss.load()
    DATA = d[d.tradition == 'Catholic'].reset_index(drop=True)


def tasks_for(items, m, burn, thin, K):
    out = []
    for g in items:
        df = DATA[DATA[g].notna()]
        if len(df) < MIN_N or df[g].nunique() < 2:
            continue
        counts = df.groupby('year').size()
        if len(counts) < 3:
            continue
        for yr, n in counts.items():
            if n >= MIN_YEAR and df[df.year != yr][g].nunique() == 2:
                out.append((g, int(yr), m, burn, thin, K))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--m', type=int, default=10)
    ap.add_argument('--burn', type=int, default=500)
    ap.add_argument('--thin', type=int, default=50)
    ap.add_argument('--K', type=int, default=30)
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--items', nargs='*')
    ap.add_argument('--years', nargs='*', type=int)
    ap.add_argument('--out', default='mixture.csv')
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    init()
    tasks = tasks_for(a.items or (list(gss.TARGETS) + list(gss.CATHOLIC_ONLY)), a.m, a.burn, a.thin, a.K)
    if a.years:
        tasks = [t for t in tasks if t[1] in a.years]
    # Longest first, so the pool does not end on one slow item.
    tasks.sort(key=lambda t: -int(DATA[t[0]].notna().sum()))
    print(len(tasks), 'item-years', flush=True)
    rows = []
    with ProcessPoolExecutor(a.jobs, initializer=init) as ex:
        for i, r in enumerate(ex.map(one, tasks)):
            rows.append(r)
            if i % 10 == 0:
                print(i, r['target'], r['year'], r['seconds'], 's', flush=True)
                pd.DataFrame(rows).to_csv(OUT / a.out, index=False)
    pd.DataFrame(rows).sort_values(['target', 'year']).to_csv(OUT / a.out, index=False)
    print('done', flush=True)


if __name__ == '__main__':
    main()

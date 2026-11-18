#!/usr/bin/env python3
"""Milestone 3 (part): does chained-equation multiple imputation (MICE) recover a held-out ballot?

    python3 experiments/m3_mice/run.py [--m 5] [--jobs 4] [--items attend_weekly ...]

Same design as m3_year_holdout (Catholics; for each item and each survey year asked of >= 150
respondents, the whole year's answers to the item are removed and imputed from all other years;
`year` is not a feature). Unlike the single-model variants, this is the standard multiple-imputation
workflow (Rubin 1987; van Buuren and Groothuis-Oudshoorn 2011):

  1. Stack the training years and the held-out year. Numeric features as they are, categorical ones
     one-hot coded with their missingness kept, plus the target (missing for the held-out year).
  2. Run m chained-equation imputations (sklearn IterativeImputer, BayesianRidge, sample_posterior,
     5 rounds, a different seed per imputation), so missing features are imputed jointly.
  3. Two imputation models for the target, from the same m completed datasets:
       mice_norm    the chain's own Bayesian linear draw, clipped to [0, 1] (mice "norm")
       mice_logreg  logistic regression fitted on a bootstrap resample of the training rows, then a
                    Bernoulli draw for each held-out respondent (mice "logreg.boot")
  4. Per imputation, the weighted share of the held-out year; Rubin's rules combine them:
     Q = mean share, B = between-imputation variance, U = mean within-imputation variance of a
     weighted mean (Kish effective n), T = U + (1 + 1/m) B, interval Q +- 1.96 sqrt(T).

Reports, per item-year, both shares, their Rubin intervals and whether they cover that year's
observed weighted share. Baselines (decade mean, interpolation) and the earlier variants (plain hgb,
hgb_shift, hgb_w5) are joined from the committed CSVs by summarise.py.
Writes results/mice.csv. Plan and predictions: LOG.md, 2026-11-10.
"""
import argparse, sys, warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'src'))
import gss  # noqa: E402
import importlib.util  # noqa: E402
from sklearn.experimental import enable_iterative_imputer  # noqa: E402,F401
from sklearn.impute import IterativeImputer  # noqa: E402
from sklearn.linear_model import BayesianRidge, LogisticRegression  # noqa: E402


def _load(name, path):
    sp = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(sp); sys.modules[name] = m; sp.loader.exec_module(m)
    return m


yh = _load('yh', ROOT / 'experiments' / 'm3_year_holdout' / 'run.py')
OUT = Path(__file__).resolve().parent / 'results'
MIN_N = 300


def design(df, feats, target):
    """Numeric matrix: numeric features, one-hot categoricals (NaN where the category is missing),
    then the target as the last column."""
    cols = []
    for f in feats:
        x = df[f].astype(float)
        if f in gss.CATEGORICAL:
            levels = sorted(x.dropna().unique())
            d = pd.get_dummies(x, prefix=f, dtype=float)
            d = d[[c for c in d.columns]]
            d[x.isna().values] = np.nan
            if len(levels) > 1:
                cols.append(d.iloc[:, 1:])  # drop one reference level
        else:
            cols.append(x.to_frame())
    X = pd.concat(cols, axis=1)
    X = X.loc[:, X.notna().any()]
    return X.values, df[target].values.astype(float)


def wmean_var(v, w):
    """Weighted mean and its variance under the Kish effective sample size."""
    q = np.average(v, weights=w)
    neff = w.sum() ** 2 / (w ** 2).sum()
    s2 = np.average((v - q) ** 2, weights=w)
    return q, s2 / neff


def rubin(qs, us):
    qs, us = np.asarray(qs), np.asarray(us)
    m = len(qs)
    Q, U, B = qs.mean(), us.mean(), qs.var(ddof=1)
    T = U + (1 + 1 / m) * B
    return Q, np.sqrt(T), np.sqrt(B)


def one(args):
    g, yr, m = args
    warnings.filterwarnings('ignore')
    d = DATA
    df = d[d[g].notna()].reset_index(drop=True)
    feats = [f for f in gss.features_for(g) if f != 'year']
    te_mask = (df.year == yr).values
    # Features never observed in the training years are dropped (as m1.fit_predict does).
    feats = [f for f in feats if df.loc[~te_mask, f].notna().any()]
    X, y = design(df, feats, g)
    y_obs = y.copy()
    y_mis = y.copy(); y_mis[te_mask] = np.nan
    Z = np.column_stack([X, y_mis])
    w = df.w.values
    wt = w[te_mask]
    obs = np.average(y_obs[te_mask], weights=wt)
    rng = np.random.default_rng(1000 * yr + len(g))
    qn, un, ql, ul = [], [], [], []
    tr_idx = np.where(~te_mask)[0]
    for k in range(m):
        imp = IterativeImputer(estimator=BayesianRidge(), sample_posterior=True, max_iter=5,
                               random_state=k, skip_complete=True)
        C = imp.fit_transform(Z)
        yn = np.clip(C[te_mask, -1], 0, 1)
        q, u = wmean_var(yn, wt); qn.append(q); un.append(u)
        Xc = C[:, :-1]
        b = rng.choice(tr_idx, len(tr_idx), replace=True)
        lr = LogisticRegression(C=1.0, max_iter=2000)
        mu, sd = Xc[tr_idx].mean(0), Xc[tr_idx].std(0) + 1e-9
        lr.fit((Xc[b] - mu) / sd, y_obs[b], sample_weight=w[b])
        p = lr.predict_proba((Xc[te_mask] - mu) / sd)[:, 1]
        yl = (rng.random(len(p)) < p).astype(float)
        q, u = wmean_var(yl, wt); ql.append(q); ul.append(u)
    r = dict(target=g, year=int(yr), n=int(te_mask.sum()), observed=obs, m=m)
    for name, qs, us in (('mice_norm', qn, un), ('mice_logreg', ql, ul)):
        Q, se, sb = rubin(qs, us)
        r[name], r[name + '_se'], r[name + '_sd_between'] = Q, se, sb
        r[name + '_covers'] = int(abs(Q - obs) <= 1.96 * se)
    return r


DATA = None


def init():
    global DATA
    d = gss.load()
    DATA = d[d.tradition == 'Catholic'].reset_index(drop=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--m', type=int, default=5)
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--items', nargs='*')
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    init()
    tasks = []
    for g in a.items or (list(gss.TARGETS) + list(gss.CATHOLIC_ONLY)):
        df = DATA[DATA[g].notna()]
        if len(df) < MIN_N or df[g].nunique() < 2:
            continue
        counts = df.groupby('year').size()
        if len(counts) < 3:
            continue
        for yr, n in counts.items():
            if n >= yh.MIN_YEAR and df[df.year != yr][g].nunique() == 2:
                tasks.append((g, int(yr), a.m))
    print(len(tasks), 'item-years', flush=True)
    rows = []
    with ProcessPoolExecutor(a.jobs, initializer=init) as ex:
        for i, r in enumerate(ex.map(one, tasks)):
            rows.append(r)
            if i % 20 == 0:
                print(i, r['target'], r['year'], flush=True)
                pd.DataFrame(rows).to_csv(OUT / 'mice.csv', index=False)
    pd.DataFrame(rows).sort_values(['target', 'year']).to_csv(OUT / 'mice.csv', index=False)
    print('done', flush=True)


if __name__ == '__main__':
    main()

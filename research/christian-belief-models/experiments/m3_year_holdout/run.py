#!/usr/bin/env python3
"""Milestone 3 (part): does the imputed share match the share from a ballot the model never saw?

    python3 experiments/m3_year_holdout/run.py [--boot 200] [--kinds hgb logit]

Catholics. For each target and each survey year in which it was asked of >= MIN_YEAR respondents,
the whole year is held out, a model is fitted on all OTHER years, and the weighted mean prediction
for the held-out respondents is compared with their weighted observed share (respondent bootstrap
95% interval). `year` is not a feature (a held-out year has no training rows to learn it from).
Baselines for the same year share: the mean of the other years in the same decade ("decade"), and
linear interpolation between the nearest earlier and later asked years ("interp"; the nearest year
alone at the ends). Writes results/year_holdout.csv. Plan and predictions: LOG.md, 2026-11-08.
"""
import argparse, sys
from pathlib import Path
import numpy as np
import pandas as pd
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'src'))
sys.path.insert(0, str(ROOT / 'experiments' / 'm1_imputation'))
import gss  # noqa: E402
import run as m1  # noqa: E402

OUT = Path(__file__).resolve().parent / 'results'
MIN_YEAR = 150


def baselines(shares, yr):
    """shares: {year: observed weighted share} of the other years."""
    ys = np.array(sorted(k for k in shares if k != yr))
    dec = [shares[k] for k in ys if k // 10 == yr // 10]
    decade = np.mean(dec) if dec else np.mean([shares[k] for k in ys])
    lo, hi = ys[ys < yr], ys[ys > yr]
    if len(lo) and len(hi):
        a, b = lo.max(), hi.min()
        interp = shares[a] + (shares[b] - shares[a]) * (yr - a) / (b - a)
    else:
        interp = shares[lo.max()] if len(lo) else shares[hi.min()]
    return decade, interp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--boot', type=int, default=200)
    ap.add_argument('--kinds', nargs='+', default=['hgb', 'logit'])
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    rng = np.random.default_rng(0)
    d = gss.load()
    d = d[d.tradition == 'Catholic'].reset_index(drop=True)
    rows = []
    for g in list(gss.TARGETS) + list(gss.CATHOLIC_ONLY):
        df = d[d[g].notna()].reset_index(drop=True)
        if len(df) < m1.MIN_N or df[g].nunique() < 2:
            continue
        feats = [f for f in gss.features_for(g) if f != 'year']
        sh = {int(yr): np.average(x[g], weights=x.w) for yr, x in df.groupby('year')}
        for yr in sorted(df.year.unique()):
            te = df[df.year == yr]
            tr = df[df.year != yr]
            if len(te) < MIN_YEAR or len(sh) < 3 or tr[g].nunique() < 2:
                continue
            y, w = te[g].values.astype(float), te.w.values
            obs = np.average(y, weights=w)
            P = {k: m1.fit_predict(k, tr, te, g, feats) for k in a.kinds}
            dec, interp = baselines(sh, int(yr))
            idx = rng.integers(0, len(te), (a.boot, len(te)))
            ob = np.array([np.average(y[i], weights=w[i]) for i in idx])
            r = dict(target=g, year=int(yr), n=len(te), observed=obs, decade=dec, interp=interp)
            r['lo'], r['hi'] = np.percentile(ob, [2.5, 97.5])
            for k, p in P.items():
                r[k] = np.average(p, weights=w)
                pb = np.array([np.average(p[i], weights=w[i]) - np.average(y[i], weights=w[i]) for i in idx])
                r[k + '_bias_lo'], r[k + '_bias_hi'] = np.percentile(pb, [2.5, 97.5])
            rows.append(r)
        print(g, flush=True)
        pd.DataFrame(rows).to_csv(OUT / 'year_holdout.csv', index=False)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Milestone 3 (part): does a period term fix the held-out-year share bias?

    python3 experiments/m3_period_shift/run.py [--boot 200]

Same design as m3_year_holdout (Catholics, whole survey year held out, fit on the other years,
weighted mean prediction vs the year's observed weighted share). Variants, all with the year-free
feature set unless noted:
  logit_year  logistic regression with `year` as a numeric feature (linear period term, extrapolated)
  logit_shift year-free logit + a logit offset, fitted so the model reproduces the observed share in the
              nearest earlier and later asked years (TRAINING rows), interpolated linearly in year
  hgb_shift   the same offset applied to gradient boosting (neighbour fit is in-sample, so a boosted
              model's neighbour residual is optimistic: disclosed, see LOG.md)
Baselines, "interp" (linear interpolation of neighbouring observed shares) and "decade", as before.
Writes results/period_shift.csv. Plan and predictions: LOG.md, 2026-11-08 (second entry).
"""
import argparse, sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.optimize import brentq
from scipy.special import expit, logit
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'src'))
sys.path.insert(0, str(ROOT / 'experiments' / 'm1_imputation'))
sys.path.insert(0, str(ROOT / 'experiments' / 'm3_year_holdout'))
import gss  # noqa: E402
import importlib.util  # noqa: E402
def _load(name, path):
    sp = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(sp); sys.modules[name] = m; sp.loader.exec_module(m)
    return m
m1 = _load('m1_run', ROOT / 'experiments' / 'm1_imputation' / 'run.py')
_s = importlib.util.spec_from_file_location('yh', ROOT / 'experiments' / 'm3_year_holdout' / 'run.py')
yh = importlib.util.module_from_spec(_s); sys.modules['yh'] = yh; _s.loader.exec_module(yh)

OUT = Path(__file__).resolve().parent / 'results'
MIN_YEAR = yh.MIN_YEAR
EPS = 1e-4


def offset_for(p, w, share):
    """Logit offset d with weighted mean expit(logit(p)+d) = share."""
    z = logit(np.clip(p, EPS, 1 - EPS))
    share = float(np.clip(share, 0.002, 0.998))
    f = lambda d: np.average(expit(z + d), weights=w) - share
    return brentq(f, -8, 8)


def shifted(p_te, model_preds, tr, g, yr):
    """model_preds: prediction for training rows. Offsets at nearest earlier/later asked years."""
    ys = np.array(sorted(tr.year.unique()))
    lo, hi = ys[ys < yr], ys[ys > yr]
    off = {}
    for y in ([lo.max()] if len(lo) else []) + ([hi.min()] if len(hi) else []):
        m = (tr.year == y).values
        off[int(y)] = offset_for(model_preds[m], tr.w.values[m],
                                 np.average(tr[g].values[m], weights=tr.w.values[m]))
    if len(off) == 2:
        a, b = min(off), max(off)
        d = off[a] + (off[b] - off[a]) * (yr - a) / (b - a)
    else:
        d = list(off.values())[0]
    z = logit(np.clip(p_te, EPS, 1 - EPS))
    return expit(z + d)


def fit_both(kind, tr, te, g, feats):
    """Predictions on te and on tr from one fit (reuses m1.fit_predict on the concatenation)."""
    both = pd.concat([te, tr], ignore_index=True)
    p = m1.fit_predict(kind, tr, both, g, feats)
    return p[:len(te)], p[len(te):]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--boot', type=int, default=200)
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
        base = [f for f in gss.features_for(g) if f != 'year']
        sh = {int(yr): np.average(x[g], weights=x.w) for yr, x in df.groupby('year')}
        for yr in sorted(df.year.unique()):
            te, tr = df[df.year == yr], df[df.year != yr]
            if len(te) < MIN_YEAR or len(sh) < 3 or tr[g].nunique() < 2:
                continue
            y, w = te[g].values.astype(float), te.w.values
            P = {}
            P['logit_year'] = m1.fit_predict('logit', tr, te, g, base + ['year'])
            for k in ('logit', 'hgb'):
                pt, ptr = fit_both(k, tr, te, g, base)
                P[k + '_plain'] = pt
                P[k + '_shift'] = shifted(pt, ptr, tr, g, int(yr))
            dec, interp = yh.baselines(sh, int(yr))
            idx = rng.integers(0, len(te), (a.boot, len(te)))
            r = dict(target=g, year=int(yr), n=len(te), observed=np.average(y, weights=w), decade=dec, interp=interp)
            for k, p in P.items():
                r[k] = np.average(p, weights=w)
                pb = np.array([np.average(p[i], weights=w[i]) - np.average(y[i], weights=w[i]) for i in idx])
                r[k + '_bias_lo'], r[k + '_bias_hi'] = np.percentile(pb, [2.5, 97.5])
            rows.append(r)
        print(g, flush=True)
        pd.DataFrame(rows).to_csv(OUT / 'period_shift.csv', index=False)


if __name__ == '__main__':
    main()

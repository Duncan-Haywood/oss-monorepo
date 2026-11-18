#!/usr/bin/env python3
"""Milestone 3 (part): does fitting only on the nearest years fix the held-out-year bias?

    python3 experiments/m3_local_window/run.py [--boot 200]

Same design as m3_year_holdout and m3_period_shift (Catholics, whole survey year held out, weighted
mean prediction vs that year's observed weighted share, respondent bootstrap). Variants use the
year-free feature set, fitted only on training years within +-W years of the held-out year, so the
relation between a respondent's other answers and the item is the one of the neighbouring period:
  logit_w5, hgb_w5, logit_w10, hgb_w10   (W = 5 and 10)
A window with fewer than MIN_TR respondents or one class falls back to all other years (counted).
Baselines "interp" and "decade" as before; plain hgb and hgb_shift are copied from period_shift.csv
for the same item-years. Writes results/local_window.csv. Plan and predictions: LOG.md, 2026-11-09.
"""
import argparse, sys
from pathlib import Path
import numpy as np
import pandas as pd
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'src'))
import gss  # noqa: E402
import importlib.util  # noqa: E402
def _load(name, path):
    sp = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(sp); sys.modules[name] = m; sp.loader.exec_module(m)
    return m
m1 = _load('m1_run', ROOT / 'experiments' / 'm1_imputation' / 'run.py')
yh = _load('yh', ROOT / 'experiments' / 'm3_year_holdout' / 'run.py')
OUT = Path(__file__).resolve().parent / 'results'
MIN_YEAR, MIN_TR = yh.MIN_YEAR, 600
WINDOWS = (5, 10)


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
            P, fb = {}, {}
            for W in WINDOWS:
                trw = tr[(tr.year - yr).abs() <= W]
                ok = len(trw) >= MIN_TR and trw[g].nunique() == 2
                fb[W] = int(not ok)
                use = trw if ok else tr
                for k in ('logit', 'hgb'):
                    P[f'{k}_w{W}'] = m1.fit_predict(k, use, te, g, base)
            dec, interp = yh.baselines(sh, int(yr))
            idx = rng.integers(0, len(te), (a.boot, len(te)))
            r = dict(target=g, year=int(yr), n=len(te), observed=np.average(y, weights=w), decade=dec, interp=interp,
                     fallback_w5=fb[5], fallback_w10=fb[10])
            for k, p in P.items():
                r[k] = np.average(p, weights=w)
                pb = np.array([np.average(p[i], weights=w[i]) - np.average(y[i], weights=w[i]) for i in idx])
                r[k + '_bias_lo'], r[k + '_bias_hi'] = np.percentile(pb, [2.5, 97.5])
            rows.append(r)
        print(g, flush=True)
        pd.DataFrame(rows).to_csv(OUT / 'local_window.csv', index=False)


if __name__ == '__main__':
    main()

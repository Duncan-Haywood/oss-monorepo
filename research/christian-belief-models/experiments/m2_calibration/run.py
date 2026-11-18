#!/usr/bin/env python3
"""Milestone 2 (part): is the imputed share right in each decade x generation cell, and is the
model calibrated across the probability range?

    python3 experiments/m2_calibration/run.py [--boot 200]

Catholics, hgb, 5-fold weighted out-of-fold predictions (seed 0). For each target, cells of
decade x immigrant generation (weighted n >= 100 respondents): weighted mean prediction minus
weighted observed share, with a respondent-bootstrap 95% interval. Also a weighted expected
calibration error (10 equal-count bins) per target.
Writes results/cell_bias.csv and results/ece.csv. Plan and predictions: LOG.md, 2026-11-07
(calibration entry), written before this ran.
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
MIN_CELL = 100


def ece(y, p, w, bins=10):
    q = pd.qcut(p, bins, duplicates='drop', labels=False)
    tot, e = w.sum(), 0.0
    for b in np.unique(q):
        m = q == b
        e += w[m].sum() / tot * abs(np.average(p[m], weights=w[m]) - np.average(y[m], weights=w[m]))
    return e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--boot', type=int, default=200)
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    rng = np.random.default_rng(0)
    d = gss.load()
    d = d[d.tradition == 'Catholic'].reset_index(drop=True)
    d['decade'] = (d.year // 10) * 10
    cells, eces = [], []
    for g in list(gss.TARGETS) + list(gss.CATHOLIC_ONLY):
        df = d[d[g].notna()].reset_index(drop=True)
        if len(df) < m1.MIN_N or df[g].nunique() < 2:
            continue
        P = m1.oof(df, g, gss.features_for(g), ['hgb'], seed=0)['hgb']
        y, w = df[g].values.astype(float), df.w.values
        eces.append(dict(target=g, n=len(df), ece=ece(y, P, w), auc=m1.metrics(y, P, w)['auc']))
        for (dec, gen), idx in df.groupby(['decade', 'generation']).indices.items():
            if len(idx) < MIN_CELL:
                continue
            yy, pp, ww = y[idx], P[idx], w[idx]
            bias = np.average(pp, weights=ww) - np.average(yy, weights=ww)
            bs = []
            for _ in range(a.boot):
                i = rng.integers(0, len(idx), len(idx))
                bs.append(np.average(pp[i], weights=ww[i]) - np.average(yy[i], weights=ww[i]))
            lo, hi = np.percentile(bs, [2.5, 97.5])
            cells.append(dict(target=g, decade=int(dec), generation=int(gen), n=len(idx),
                              observed=np.average(yy, weights=ww), imputed=np.average(pp, weights=ww),
                              bias=bias, lo=lo, hi=hi))
        print(g, flush=True)
        pd.DataFrame(cells).to_csv(OUT / 'cell_bias.csv', index=False)
        pd.DataFrame(eces).to_csv(OUT / 'ece.csv', index=False)


if __name__ == '__main__':
    main()

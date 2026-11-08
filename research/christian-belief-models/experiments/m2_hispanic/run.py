#!/usr/bin/env python3
"""Milestone 2 (part): do associations learned on third-plus-generation Catholics transfer to
first-generation Catholics equally for Hispanic and non-Hispanic immigrants?

    python3 experiments/m2_hispanic/run.py [--boot 200]

For each Catholic target, fit hgb on generation-3 Catholics only and score first-generation
Catholics split by hispanic_any. Compared with the pooled model's own out-of-fold predictions
(5-fold, seed 0) on the same rows. Writes results/hispanic_transfer.csv.
Plan and predictions: LOG.md, 2026-11-07 entry, written before this ran.
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
        feats = gss.features_for(g)
        P = m1.oof(df, g, feats, ['hgb'], seed=0)['hgb']
        tr3 = df[df.generation == 3]
        for label, mask in (('hispanic', (df.generation == 1) & (df.hispanic_any == 1)),
                            ('non-hispanic', (df.generation == 1) & (df.hispanic_any == 0))):
            mask = mask.values
            te = df[mask]
            if mask.sum() < 100 or te[g].nunique() < 2:
                rows.append(dict(target=g, group=label, n=int(mask.sum()), note='too few'))
                continue
            p3 = m1.fit_predict('hgb', tr3, te, g, feats)
            y, w = te[g].values, te.w.values
            m3, mp = m1.metrics(y, p3, w), m1.metrics(y, P[mask], w)
            (alo, ahi), _ = m1.paired_boot(y, w, p3, P[mask], a.boot, rng)
            rows.append(dict(target=g, group=label, n=int(mask.sum()), base_rate=m3['base_rate'],
                             mean_pred_gen3_model=np.average(p3, weights=w),
                             level_gap=np.average(p3, weights=w) - m3['base_rate'],
                             auc_gen3_model=m3['auc'], auc_pooled_oof=mp['auc'],
                             auc_loss=mp['auc'] - m3['auc'], loss_lo=-ahi, loss_hi=-alo))
        print(g, flush=True)
        pd.DataFrame(rows).to_csv(OUT / 'hispanic_transfer.csv', index=False)


if __name__ == '__main__':
    main()

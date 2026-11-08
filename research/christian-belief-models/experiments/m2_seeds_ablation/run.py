#!/usr/bin/env python3
"""Milestone 2: are milestone 1's Catholic AUCs stable across CV seeds, and how much do politics carry?

    python3 experiments/m2_seeds_ablation/run.py [--seeds 3]

For every Catholic target: logit and hgb, 5-fold weighted CV, seeds 0..S-1, in two feature sets,
full (milestone 1) and nopol (polviews and partyid removed). Writes results/seeds_ablation.csv.
Plan and predictions: LOG.md, 2026-11-06 entry, written before this ran.
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
POL = {'polviews', 'partyid'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seeds', type=int, default=3)
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    d = gss.load()
    d = d[d.tradition == 'Catholic'].reset_index(drop=True)
    targets = list(gss.TARGETS) + list(gss.CATHOLIC_ONLY)
    rows = []
    for g in targets:
        df = d[d[g].notna()].reset_index(drop=True)
        if len(df) < m1.MIN_N or df[g].nunique() < 2:
            continue
        y, w = df[g].values, df.w.values
        for fs in ('full', 'nopol'):
            feats = gss.features_for(g)
            if fs == 'nopol':
                feats = [f for f in feats if f not in POL]
            for seed in range(a.seeds):
                P = m1.oof(df, g, feats, ['logit', 'hgb'], seed=seed)
                for k in P:
                    r = dict(target=g, features=fs, seed=seed, model=k, n=len(df))
                    r.update(m1.metrics(y, P[k], w))
                    rows.append(r)
        print(g, len(df), flush=True)
        pd.DataFrame(rows).to_csv(OUT / 'seeds_ablation.csv', index=False)


if __name__ == '__main__':
    main()

"""Person-level inputs for the survival-native comparison (survival_native.py, which runs in a
separate environment with scikit-survival).

For a person-period lens, writes <scratch>/flex_data/surv_<lens>.npz (OUTSIDE the repository):
  X       baseline features (numerics median-imputed and standardised, categoricals one-hot), float32
  T, D, W follow-up years, event, survey weight;  fold  outer fold (repeat 0);  group  cluster
  S_<m>   held-out survival curves S(1..H) from the lens baseline GLM and the tuned LightGBM
          (refit per fold with that fold's chosen configuration from results/<lens>.json)

  python3 export_survival.py <lens> [--sample f] [--years 20]
"""
import argparse
import importlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import flex  # noqa: E402
from lenses import _common as c  # noqa: E402


def design(people, num, cat):
    cols, names = [], []
    for col in num:
        x = pd.to_numeric(people[col], errors='coerce').astype(float).to_numpy()
        med = np.nanmedian(x)
        miss = np.isnan(x)
        x = np.where(miss, med, x)
        cols.append(((x - x.mean()) / (x.std() or 1.0))[:, None])
        names.append(col)
        if miss.any():
            cols.append(miss[:, None].astype(float))
            names.append(col + '_missing')
    for col in cat:
        v = people[col].astype(str).to_numpy()
        lv = pd.Series(v).value_counts()
        for level in lv.index[1:]:
            if lv[level] >= 20:
                cols.append((v == level)[:, None].astype(float))
                names.append(f'{col}={level}')
    return np.hstack(cols).astype(np.float32), names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('lens')
    ap.add_argument('--sample', type=float, default=None)
    ap.add_argument('--years', type=int, default=20)
    a = ap.parse_args()
    mod = importlib.import_module(f'lenses.{a.lens}')
    L = mod.load(sample=a.sample) if a.sample else mod.load()
    P = L.people.reset_index(drop=True)
    feats_num = [x for x in L.num if x != L.dur]
    X, names = design(P, feats_num, L.cat)
    pfold = np.full(len(P), -1)
    pfold[L.person] = L.folds[0]
    res = json.loads((HERE.parent / 'results' / f'{L.name}.json').read_text())
    info = {i['fold']: i for i in res['main']['info'] if i['repeat'] == 0}
    H = a.years
    curves = {k: np.full((len(P), H), np.nan) for k in ('baseline', 'lightgbm_tuned')}
    for f in np.unique(pfold[pfold >= 0]):
        tr = np.flatnonzero(L.folds[0] != f)
        te_p = np.flatnonzero(pfold == f)
        g = P.iloc[te_p].loc[P.index[te_p].repeat(H)].copy()
        g[L.dur] = np.tile(np.arange(H, dtype=float), len(te_p))
        cfg = info[int(f)]['lightgbm_tuned']
        models = {'baseline': flex.Baseline().fit(L, tr),
                  'lightgbm_tuned': flex.LGBM(params=(cfg['config'], cfg['rounds'])).fit(L, tr)}
        for k, m in models.items():
            h = m.predict(L, df=g).reshape(len(te_p), H)
            curves[k][te_p] = np.exp(-np.cumsum(h, axis=1))
        print('fold', f, flush=True)
    out = c.SCRATCH / 'flex_data' / f'surv_{L.name}.npz'
    np.savez_compressed(out, X=X, names=np.array(names), T=P['T'].to_numpy(float), D=P['D'].to_numpy(float),
                        W=P['W'].to_numpy(float), fold=pfold, group=P['group'].to_numpy(),
                        S_baseline=curves['baseline'], S_lightgbm_tuned=curves['lightgbm_tuned'])
    print('wrote', out, X.shape)


if __name__ == '__main__':
    main()

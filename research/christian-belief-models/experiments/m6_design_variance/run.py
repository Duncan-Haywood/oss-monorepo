#!/usr/bin/env python3
"""Milestone 6 (part): the calibration section under the GSS's own design (strata and PSUs).

    python3 experiments/m6_design_variance/run.py [--jobs 4] [--reps 500] [--quick]

m6_calibration scored the difference estimator D = E0 + subsample mean of (y - f) against the
target's *sample* share, with Kish-linearised (weights only) variances. Two things it left out:

1. Clustering. GSS respondents are drawn in paired PSUs within strata (vstrat, vpsu). The
   ultimate-cluster (with-replacement PSU) variance of a domain's weighted share gives the design
   effect deff = V_design / V_kish, for the item y and for the residual r = y - f.
2. The survey's own sampling error. Against the *population* share, any two-phase estimator carries
   V1 = V_design(full-sample share of y), which a calibration subsample cannot reduce, plus the
   phase-2 variance V2 of the subsample. D only shrinks V2. So the total-error variance ratio of D
   to the plain mean M is (V1 + V2_D) / (V1 + V2_M), which tends to 1 as n grows.

It also checks whether V1 + V2 for D can be estimated from what a designer has (f on every target
row, y only on the subsample): the ultimate-cluster variance of the linearised
u_i = w_i (f_i - fbar) / W_T  (all T rows)  +  w_i (r_i - rbar_s) / W_s  (subsample rows).

Models and cells are fitted exactly as in m6_calibration (same boosted model, seed, features,
pairs and minimum sizes); the run first checks that it reproduces that run's biases and variance
ratios. Rows without design codes (1972-74) are each their own PSU in a per-year stratum.
Plan and predictions: LOG.md, 2026-11-16 (written before this ran).
Writes results/cells.csv (pair x item) and results/sims.csv (pair x item x n).
"""
import argparse
import importlib.util
import sys
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'src'))
import gss  # noqa: E402

_sp = importlib.util.spec_from_file_location('m6_cal', ROOT / 'experiments' / 'm6_calibration' / 'run.py')
cal = importlib.util.module_from_spec(_sp)
sys.modules['m6_cal'] = cal
_sp.loader.exec_module(cal)
sb = cal.sb

OUT = Path(__file__).resolve().parent / 'results'
NS = (50, 100, 200, 400)


# ---------- pure helpers (tested in test_design_variance.py) ----------

def design_keys(year, vstrat, vpsu, rid):
    """Integer stratum and PSU codes. Rows with no design code are each their own PSU inside one
    stratum per year (simple random sampling within year)."""
    miss = pd.isna(vstrat) | pd.isna(vpsu)
    s = np.where(miss, -np.asarray(year, float), np.asarray(year, float) * 1e5 + np.nan_to_num(vstrat))
    p = np.where(miss, rid, np.nan_to_num(vpsu))
    strat = pd.factorize(pd.Series(s))[0]
    psu = pd.factorize(pd.Series(list(zip(strat, p))))[0]
    return strat, psu


def psu_strata(strat, psu):
    """psu_strat[k] = stratum of PSU k, and n_h[h] = number of PSUs in stratum h, over the rows given
    (pass the whole file, so a domain's empty PSUs still count)."""
    ps = np.zeros(int(psu.max()) + 1, dtype=int)
    ps[psu] = strat
    return ps, np.bincount(ps, minlength=int(strat.max()) + 1)


def ultimate_cluster_var(u, psu, psu_strat, n_h):
    """With-replacement PSU variance of sum(u): sum_h n_h/(n_h-1) sum_k (U_hk - Ubar_h)^2, where the
    U_hk are PSU totals of u and k runs over every PSU of stratum h in the whole sample (PSUs with no
    domain rows have U = 0). A stratum with one PSU is centred at zero instead ("adjust")."""
    U = np.bincount(psu, weights=u, minlength=len(psu_strat))
    S = np.bincount(psu_strat, weights=U, minlength=len(n_h))
    SS = np.bincount(psu_strat, weights=U ** 2, minlength=len(n_h))
    nh = n_h.astype(float)
    v = np.where(nh > 1, nh / np.maximum(nh - 1, 1) * (SS - S ** 2 / np.maximum(nh, 1)), SS)
    return float(v.sum())


def lin_mean(x, w):
    """Linearised influence values of the weighted (Hajek) mean: w (x - xbar) / sum w."""
    return w * (x - np.average(x, weights=w)) / w.sum()


def kish_var(x, w):
    """The weights-only linearised variance of the Hajek mean (m6_calibration's, without the fpc)."""
    n = len(x)
    return float((lin_mean(x, w) ** 2).sum() * n / (n - 1))


# ---------- the experiment ----------

def run_pair(args):
    name, kind, S, T, items, reps, (psu_strat, n_h) = args
    cells, sims = [], []
    for j in items:
        s, t = S[S[j].notna()], T[T[j].notna()]
        feats = [f for f in gss.features_for(j) if s[f].notna().sum() >= 2]
        if len(s) < sb.MIN_S or len(t) < sb.MIN_T or s[j].nunique() < 2 or t[j].nunique() < 2:
            continue
        m = sb.hgb(feats).fit(s[feats].values.astype(float), s[j].values, sample_weight=s.w.values)
        f = m.predict_proba(t[feats].values.astype(float))[:, 1]
        y, w = t[j].values.astype(float), t.w.values.astype(float)
        ps = t.psu.values
        r = y - f
        N = len(t)
        theta, e0 = float(np.average(y, weights=w)), float(np.average(f, weights=w))
        vk_y, vk_r = kish_var(y, w), kish_var(r, w)
        vd_y = ultimate_cluster_var(lin_mean(y, w), ps, psu_strat, n_h)
        vd_r = ultimate_cluster_var(lin_mean(r, w), ps, psu_strat, n_h)
        cells.append(dict(pair=name, kind=kind, item=j, N=N, n_psu=len(np.unique(ps)), theta=theta,
                          bias=e0 - theta, var_ratio_kish=vk_r / vk_y, var_ratio_design=vd_r / vd_y,
                          V1_kish=vk_y, V1=vd_y, deff_y=vd_y / vk_y, deff_r=vd_r / vk_r,
                          var_ratio_cal=cal.wvar(r, w) / cal.wvar(y, w)))
        rng = np.random.default_rng(zlib.crc32(f'{name}|{j}|design'.encode()))
        uf = lin_mean(f, w)
        for n in NS:
            if n > N // 2:
                continue
            idx = np.argsort(rng.random((reps, N)), axis=1)[:, :n]
            ys, fs, ws = y[idx], f[idx], w[idx]
            M = cal.wmean_rows(ys, ws)
            D = e0 + cal.wmean_rows(ys - fs, ws)
            V2_M, V2_D = float(np.mean((M - theta) ** 2)), float(np.mean((D - theta) ** 2))
            fpc = 1 - n / N
            vk_D = cal.wvar_mean_rows(ys - fs, ws, fpc)  # m6_calibration's interval variance
            vhat = np.empty(reps)
            for k in range(reps):
                u = uf.copy()
                sub = idx[k]
                u[sub] += lin_mean(r[sub], w[sub])
                vhat[k] = ultimate_cluster_var(u, ps, psu_strat, n_h)
            sims.append(dict(pair=name, kind=kind, item=j, n=n, N=N, V1=vd_y, V2_M=V2_M, V2_D=V2_D,
                             share_V1_M=vd_y / (vd_y + V2_M), total_ratio=(vd_y + V2_D) / (vd_y + V2_M),
                             phase2_ratio=V2_D / V2_M, kish_vD_mean=float(vk_D.mean()),
                             design_vD_mean=float(vhat.mean()),
                             design_vD_over_target=float(vhat.mean()) / (vd_y + V2_D),
                             kish_vD_over_target=float(vk_D.mean()) / (vd_y + V2_D),
                             inflation_D=float(np.sqrt((vd_y + V2_D) / vk_D.mean()))))
        print(name, j, 'deff_y', round(vd_y / vk_y, 2), 'deff_r', round(cells[-1]['deff_r'], 2), flush=True)
    return cells, sims


def load():
    d = gss.load()
    des = pd.read_stata(gss.DTA, columns=['year', 'id', 'vstrat', 'vpsu'], convert_categoricals=False)
    d = d.merge(des, on=['year', 'id'], how='left', validate='one_to_one')
    d['strat'], d['psu'] = design_keys(d.year.values, d.vstrat.values, d.vpsu.values, d.id.values)
    design = psu_strata(d.strat.values, d.psu.values)  # over the whole file, every tradition
    return d[d.tradition.isin(sb.TRADS)].reset_index(drop=True), design


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--reps', type=int, default=500)
    ap.add_argument('--quick', action='store_true', help='first two pairs, 50 draws')
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    d, design = load()
    reps = 50 if a.quick else a.reps
    jobs = []
    for name, kind, sm, tm in sb.pairs(d):
        catholic_both = kind in ('generation', 'ethnicity') or name.startswith('Catholic <=')
        items = list(gss.TARGETS) + (list(gss.CATHOLIC_ONLY) if catholic_both else [])
        jobs.append((name, kind, d[sm], d[tm], items, reps, design))
    if a.quick:
        jobs = jobs[:2]
    with ProcessPoolExecutor(a.jobs) as ex:
        res = list(ex.map(run_pair, jobs))
    sfx = '_quick' if a.quick else ''
    pd.DataFrame([c for cs, _ in res for c in cs]).to_csv(OUT / f'cells{sfx}.csv', index=False)
    pd.DataFrame([s for _, ss in res for s in ss]).to_csv(OUT / f'sims{sfx}.csv', index=False)
    print('done')


if __name__ == '__main__':
    main()

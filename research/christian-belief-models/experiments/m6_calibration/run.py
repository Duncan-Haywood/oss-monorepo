#!/usr/bin/env python3
"""Milestone 6 (part): how big a calibration subsample does a rotated item need in each group, and
does the transferred model shrink it?

    python3 experiments/m6_calibration/run.py [--jobs 4] [--reps 500] [--quick]

A model f_j for item j is fitted on a source group S (the milestone-1 boosted model, as in
m6_shift_bound) and scores every target respondent T asked j. A simple random calibration subsample
of n target respondents reveals their answers. Estimators of T's weighted share theta_j:

  E0    sum_T w f / sum_T w                                   (no labels; bias b)
  M     subsample weighted mean of y                          (variance ~ s2_y / n)
  D     E0 + subsample weighted mean of (y - f)               (difference / prediction-powered;
                                                               variance ~ s2_{y-f} / n)
  PPI   lam * E0 + subsample weighted mean of (y - lam f),    lam = cov(y,f) / ((1 + n/N) var(f))
        fitted on the subsample (PPI++, Angelopoulos, Duchi and Zrnic 2023, arXiv:2311.01453)
  R     sum_T w sigmoid(logit f + delta) / sum_T w,           delta fitted on the subsample so its
        recalibrated mean equals its observed mean

Analytic quantities per cell (computed on all T rows): variance ratio s2_{y-f}/s2_y (the fraction
of M's sample D needs) and the break-even n* = s2_{y-f} / b^2 above which D beats E0 on MSE.
Plan and predictions: LOG.md, 2026-11-12 (written before this ran).
Writes results/cells.csv (one row per pair x item) and results/sims.csv (pair x item x n).
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

_sp = importlib.util.spec_from_file_location('m6_shift', ROOT / 'experiments' / 'm6_shift_bound' / 'run.py')
sb = importlib.util.module_from_spec(_sp)
sys.modules['m6_shift'] = sb
_sp.loader.exec_module(sb)

OUT = Path(__file__).resolve().parent / 'results'
NS = (25, 50, 100, 200, 400)
Z95 = 1.959964


# ---------- pure helpers (tested in test_calibration.py) ----------

def wmean_rows(x, w):
    """Weighted mean of each row of x (R x n) with weights w (R x n)."""
    return (w * x).sum(1) / w.sum(1)


def wvar_mean_rows(x, w, fpc=1.0):
    """Linearised variance of the weighted (Hajek) mean of each row: sum w^2 (x - xbar)^2 / (sum w)^2,
    times n/(n-1) and a finite-population correction."""
    n = x.shape[1]
    xb = wmean_rows(x, w)[:, None]
    return (w ** 2 * (x - xb) ** 2).sum(1) / w.sum(1) ** 2 * n / (n - 1) * fpc


def ppi_lambda(y, f, w, n, N):
    """Power-tuning factor per row: weighted cov(y, f) / ((1 + n/N) var(f)), clipped to [0, 1]."""
    fb, yb = wmean_rows(f, w)[:, None], wmean_rows(y, w)[:, None]
    cov = wmean_rows((y - yb) * (f - fb), w)
    var = wmean_rows((f - fb) ** 2, w)
    lam = np.where(var > 0, cov / np.where(var > 0, var, 1) / (1 + n / N), 0.0)
    return np.clip(lam, 0.0, 1.0)


def logit_shift_rows(z, w, target, iters=30):
    """delta per row r with sum_i w[r,i] sigmoid(z[r,i] + delta_r) / sum_i w[r,i] = target[r]
    (Newton with a bisection safeguard; the mean is increasing in delta)."""
    t = np.clip(target, 1e-4, 1 - 1e-4)
    lo, hi = np.full(len(t), -15.0), np.full(len(t), 15.0)
    d = np.zeros(len(t))
    W = w.sum(1)
    for _ in range(iters):
        p = sb.sigmoid(z + d[:, None])
        g = (w * p).sum(1) / W - t
        lo = np.where(g < 0, d, lo)
        hi = np.where(g >= 0, d, hi)
        h = (w * p * (1 - p)).sum(1) / W
        step = d - g / np.maximum(h, 1e-12)
        d = np.where((step > lo) & (step < hi), step, 0.5 * (lo + hi))
    return d


def wvar(x, w):
    m = np.average(x, weights=w)
    return float(np.average((x - m) ** 2, weights=w))


def simulate(y, f, w, n, reps, rng):
    """R simple random subsamples of size n from the N target rows; returns per-draw estimates and
    Wald interval half-widths for M and D."""
    N = len(y)
    idx = np.argsort(rng.random((reps, N)), axis=1)[:, :n]
    ys, fs, ws = y[idx], f[idx], w[idx]
    e0 = np.average(f, weights=w)
    fpc = 1 - n / N
    M = wmean_rows(ys, ws)
    D = e0 + wmean_rows(ys - fs, ws)
    lam = ppi_lambda(ys, fs, ws, n, N)
    P = lam * e0 + wmean_rows(ys - lam[:, None] * fs, ws)
    delta = logit_shift_rows(sb.logit(fs), ws, M)
    zt = sb.logit(f)
    R = np.array([np.average(sb.sigmoid(zt + dl), weights=w) for dl in delta])
    hM = Z95 * np.sqrt(wvar_mean_rows(ys, ws, fpc))
    hD = Z95 * np.sqrt(wvar_mean_rows(ys - fs, ws, fpc))
    return dict(M=M, D=D, PPI=P, R=R, hM=hM, hD=hD)


# ---------- the experiment ----------

def run_pair(args):
    name, kind, S, T, items, reps = args
    cells, sims = [], []
    for j in items:
        s, t = S[S[j].notna()], T[T[j].notna()]
        feats = [f for f in gss.features_for(j) if s[f].notna().sum() >= 2]
        if len(s) < sb.MIN_S or len(t) < sb.MIN_T or s[j].nunique() < 2 or t[j].nunique() < 2:
            continue
        m = sb.hgb(feats).fit(s[feats].values.astype(float), s[j].values, sample_weight=s.w.values)
        f = m.predict_proba(t[feats].values.astype(float))[:, 1]
        y, w = t[j].values.astype(float), t.w.values.astype(float)
        theta, e0 = float(np.average(y, weights=w)), float(np.average(f, weights=w))
        vy, vr = wvar(y, w), wvar(y - f, w)
        b = e0 - theta
        cells.append(dict(pair=name, kind=kind, item=j, N=len(t), theta=theta, E0=e0, bias=b,
                          var_y=vy, var_resid=vr, var_ratio=vr / vy,
                          n_star=vr / b ** 2 if b != 0 else np.inf))
        rng = np.random.default_rng(zlib.crc32(f'{name}|{j}'.encode()))
        for n in NS:
            if n > len(t) // 2:
                continue
            r = simulate(y, f, w, n, reps, rng)
            row = dict(pair=name, kind=kind, item=j, n=n, N=len(t), theta=theta, abs_bias_E0=abs(b))
            for e in ('M', 'D', 'PPI', 'R'):
                err = r[e] - theta
                row[f'rmse_{e}'] = float(np.sqrt(np.mean(err ** 2)))
                row[f'mean_err_{e}'] = float(err.mean())
            for e in ('M', 'D'):
                row[f'cover_{e}'] = float(np.mean(np.abs(r[e] - theta) <= r[f'h{e}']))
                row[f'halfw_{e}'] = float(np.median(r[f'h{e}']))
            sims.append(row)
        print(name, j, 'var_ratio', round(vr / vy, 3), 'n*', round(cells[-1]['n_star'], 1), flush=True)
    return cells, sims


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--reps', type=int, default=500)
    ap.add_argument('--quick', action='store_true', help='first two pairs, 100 draws')
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    d = gss.load()
    d = d[d.tradition.isin(sb.TRADS)].reset_index(drop=True)
    reps = 100 if a.quick else a.reps
    jobs = []
    for name, kind, sm, tm in sb.pairs(d):
        catholic_both = kind in ('generation', 'ethnicity') or name.startswith('Catholic <=')
        items = list(gss.TARGETS) + (list(gss.CATHOLIC_ONLY) if catholic_both else [])
        jobs.append((name, kind, d[sm], d[tm], items, reps))
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

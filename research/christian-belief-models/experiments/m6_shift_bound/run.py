#!/usr/bin/env python3
"""Milestone 6 (part): why does a transferred imputation model miss a subgroup's level, and can the
items the subgroup *was* asked tell us by how much it misses the one it was not?

    python3 experiments/m6_shift_bound/run.py [--jobs 4] [--quick]

Decomposition. A model f_j for item j is fitted on a source group S and used to impute j for a target
group T whose ballot did not carry j. Its error in T's share is

    b_j = E_T[f_j(X)] - E_T[Y_j] = A_j + B_j,
    A_j = E_T[f_j - p_S,j]     (source misfit where T lives; covariate shift; estimable without
                                any T label as E_S[r(X) (f_j - Y_j)], r = dT/dS, f out-of-fold)
    B_j = E_T[p_S,j - p_T,j]   (conditional, or concept, shift; needs T's labels for j)

so |b_j| <= |A_j| + |B_j|, and by Cauchy-Schwarz |A_j| <= sqrt(1 + chi2(T||S)) ||f_j - p_S,j||_S.
A_j is label-free; B_j is not. The test: is B_j predictable from the items T *was* asked?
For each other item k observed in T, the logit intercept delta_k that recalibrates f_k to T's
observed share is known. Estimators of T's share of the held-out item j:

  E0 naive      E_T[f_j]                                  (transfer as is; adjusts for covariates)
  E1 source     the source group's weighted share         (ignores who T is)
  IW            E_T[f_j] - A_j                            (covariate-shift correction only)
  E2 offset     E_T[sigmoid(logit f_j + median_k delta_k)]          (one common shift)
  E3 signed     E_T[sigmoid(logit f_j + sum_k rho_jk delta_k / sum_k |rho_jk|)]
                rho_jk = weighted correlation of logit f_j and logit f_k over T's rows (label-free)

All estimators use only T's covariates and T's answers to items other than j. Truth: T's observed
weighted share of j. Plan and predictions: LOG.md, 2026-11-12 (written before this ran).
Writes results/cells.csv (one row per pair x item) and results/pairs.csv.
"""
import argparse
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'src'))
import gss  # noqa: E402

OUT = Path(__file__).resolve().parent / 'results'
TRADS = ['Catholic', 'Evangelical Protestant', 'Mainline Protestant', 'Black Protestant']
MIN_S, MIN_T = 300, 150
EPS = 1e-4


# ---------- pure helpers (tested in test_shift_bound.py) ----------

def logit(p):
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))


def intercept_shift(p, w, target_share, lo=-10.0, hi=10.0, iters=80):
    """delta such that the w-weighted mean of sigmoid(logit p + delta) equals target_share (bisection;
    the mean is increasing in delta)."""
    z = logit(p)
    t = float(np.clip(target_share, EPS, 1 - EPS))
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        if np.average(sigmoid(z + mid), weights=w) < t:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def wcorr(a, b, w):
    a = a - np.average(a, weights=w)
    b = b - np.average(b, weights=w)
    den = np.sqrt(np.average(a * a, weights=w) * np.average(b * b, weights=w))
    return float(np.average(a * b, weights=w) / den) if den > 0 else 0.0


def signed_offset(deltas, rhos):
    """Similarity-weighted proxy shift: sum rho_k delta_k / sum |rho_k|; 0 if no weight."""
    deltas, rhos = np.asarray(deltas, float), np.asarray(rhos, float)
    den = np.abs(rhos).sum()
    return float((rhos * deltas).sum() / den) if den > 0 else 0.0


def density_ratio(ps, ws_sum, wt_sum, clip_q=0.99):
    """r = dT/dS from a domain classifier's P(T|x) on source rows, normalised by the weighted
    group totals, clipped at the clip_q quantile (Sugiyama et al. 2012, ch. 4 probabilistic
    classification)."""
    ps = np.clip(ps, EPS, 1 - EPS)
    r = ps / (1 - ps) * (ws_sum / wt_sum)
    return np.minimum(r, np.quantile(r, clip_q))


def iw_residual(f_oof, y, w, r):
    """A-hat = E_S[r (f - y)] with survey weights, self-normalised."""
    return float(np.sum(w * r * (f_oof - y)) / np.sum(w * r))


# ---------- the experiment ----------

def hgb(feats, seed=0):
    return HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40,
        l2_regularization=1.0, early_stopping=True, validation_fraction=0.15, random_state=seed,
        categorical_features=[f in gss.CATEGORICAL for f in feats])


def pairs(d):
    """(name, kind, source mask, target mask). Masks pick respondents; items are picked per cell."""
    c = d.tradition == 'Catholic'
    out = [
        ('Catholic gen3 -> gen1', 'generation', c & (d.generation == 3), c & (d.generation == 1)),
        ('Catholic gen3 -> gen2', 'generation', c & (d.generation == 3), c & (d.generation == 2)),
        ('Catholic gen1 -> gen3', 'generation', c & (d.generation == 1), c & (d.generation == 3)),
        ('Catholic non-Hispanic -> Hispanic', 'ethnicity', c & (d.hispanic_any == 0), c & (d.hispanic_any == 1)),
    ]
    for s in TRADS:
        for t in TRADS:
            if s != t:
                out.append((f'{s} -> {t}', 'tradition', d.tradition == s, d.tradition == t))
    for t in TRADS:
        out.append((f'{t} <=2014 -> 2016-24', 'period', (d.tradition == t) & (d.year <= 2014),
                    (d.tradition == t) & (d.year >= 2016)))
    return out


def run_pair(args):
    name, kind, S, T, items = args
    rows = []
    fits = {}
    for j in items:
        s = S[S[j].notna()]
        t = T[T[j].notna()]
        # features never observed on the source rows that carry j (another ballot) are dropped
        feats = [f for f in gss.features_for(j) if s[f].notna().sum() >= 2]
        if len(s) < MIN_S or len(t) < MIN_T or s[j].nunique() < 2 or t[j].nunique() < 2:
            continue
        Xs, ys, ws = s[feats].values.astype(float), s[j].values, s.w.values
        m = hgb(feats).fit(Xs, ys, sample_weight=ws)
        # out-of-fold source predictions for the importance-weighted residual
        f_oof = np.zeros(len(s))
        for tr, te in StratifiedKFold(5, shuffle=True, random_state=0).split(Xs, ys):
            f_oof[te] = hgb(feats).fit(Xs[tr], ys[tr], sample_weight=ws[tr]).predict_proba(Xs[te])[:, 1]
        # domain classifier on covariates only (no label of j from either group)
        Xd = np.vstack([Xs, t[feats].values.astype(float)])
        yd = np.r_[np.zeros(len(s)), np.ones(len(t))]
        wd = np.r_[ws / ws.sum(), t.w.values / t.w.values.sum()] * len(yd) / 2
        ps = np.zeros(len(s))
        for tr, te in StratifiedKFold(5, shuffle=True, random_state=1).split(Xd, yd):
            dm = hgb(feats).fit(Xd[tr], yd[tr], sample_weight=wd[tr])
            src = te[te < len(s)]
            ps[src] = dm.predict_proba(Xd[src])[:, 1]
        r = density_ratio(ps, 1.0, 1.0)  # weights already balanced to equal totals in wd
        A = iw_residual(f_oof, ys, ws, r)
        ess = r.sum() ** 2 / (r ** 2).sum() / len(r)
        fits[j] = dict(model=m, feats=feats, A=A, ess=ess,
                       src_share=float(np.average(ys, weights=ws)))
    # Every fitted model scores every T row, so rho_jk can be computed on j's T rows.
    cells = {}
    for j, fj in fits.items():
        t = T[T[j].notna()]
        p = fj['model'].predict_proba(t[fj['feats']].values.astype(float))[:, 1]
        y, w = t[j].values, t.w.values
        share = float(np.average(y, weights=w))
        cells[j] = dict(p=p, share=share, delta=intercept_shift(p, w, share), t_index=t.index)
    for j, fj in fits.items():
        cj = cells[j]
        t = T.loc[cj['t_index']]
        w = t.w.values
        e0 = float(np.average(cj['p'], weights=w))
        others = [k for k in cells if k != j]
        if not others:
            continue
        deltas = np.array([cells[k]['delta'] for k in others])
        zj = logit(cj['p'])
        rhos = np.array([wcorr(zj, logit(fits[k]['model'].predict_proba(
            t[fits[k]['feats']].values.astype(float))[:, 1]), w) for k in others])
        d2 = float(np.median(deltas))
        d3 = signed_offset(deltas, rhos)
        rows.append(dict(
            pair=name, kind=kind, item=j, n_source=int(S[j].notna().sum()), n_target=len(t),
            truth=cj['share'], E0=e0, E1=fj['src_share'], IW=e0 - fj['A'],
            E2=float(np.average(sigmoid(zj + d2), weights=w)),
            E3=float(np.average(sigmoid(zj + d3), weights=w)),
            bias=e0 - cj['share'], A=fj['A'], B=e0 - cj['share'] - fj['A'], delta=cj['delta'],
            proxy_delta_median=d2, proxy_delta_signed=d3, n_other_items=len(others),
            iw_ess_frac=fj['ess']))
        print(name, j, round(rows[-1]['bias'] * 100, 2), round((rows[-1]['E3'] - cj['share']) * 100, 2),
              flush=True)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--quick', action='store_true', help='first two pairs only')
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    d = gss.load()
    d = d[d.tradition.isin(TRADS)].reset_index(drop=True)
    jobs = []
    for name, kind, sm, tm in pairs(d):
        catholic_both = kind in ('generation', 'ethnicity') or name.startswith('Catholic <=')
        items = list(gss.TARGETS) + (list(gss.CATHOLIC_ONLY) if catholic_both else [])
        jobs.append((name, kind, d[sm], d[tm], items))
    if a.quick:
        jobs = jobs[:2]
    with ProcessPoolExecutor(a.jobs) as ex:
        rows = [r for rs in ex.map(run_pair, jobs) for r in rs]
    cells = pd.DataFrame(rows)
    cells.to_csv(OUT / ('cells_quick.csv' if a.quick else 'cells.csv'), index=False)
    print('cells', len(cells))


if __name__ == '__main__':
    main()

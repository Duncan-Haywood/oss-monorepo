#!/usr/bin/env python3
"""Milestone 6 (part): how should a fixed calibration budget be split across subgroups, and does
shrinking toward the transferred model beat the difference estimator?

    python3 experiments/m6_allocation/run.py [--jobs 4] [--reps 300] [--quick]

Cells are the milestone-6 source->target pairs x items (models as in m6_calibration). A family is the
set of cells sharing an item and a kind: tradition (one source, its three target traditions), period
(the four traditions' 2016-24 targets), generation (Catholic gen1, gen2, gen3 targets). A budget
B = G * nbar calibration respondents is split across the G groups. Per group g, with E0_g the mean of
the transferred model's predictions over the asked target, rbar_g the subsample's weighted mean
residual y - f and vhat_g its linearised variance:

  M_eq      equal split, subsample weighted mean of y
  D_eq      equal split, E0 + rbar (difference estimator; the reference)
  D_ney     Neyman split on the oracle residual sd (times the Kish weight design effect), D
  C_or      oracle composite E0 + gamma rbar, gamma = b^2/(b^2 + v), with known bias b and v, split by
            water-filling n_g = clip(sd_g * lam - nstar_g, 0, cap_g); a lower bound, not feasible
  FH_fam    equal split, gamma = tau2/(tau2 + vhat), tau2 = max(0, mean_g(rbar^2 - vhat)) per draw
  FH_prior  equal split, gamma as above with tau2 = mean b^2 of the same kind's cells on other items
  FH2       half the budget as an equal pilot; the rest water-filled on the pilot's posterior
            E[b^2] = (gamma0 rbar)^2 + gamma0 vhat and sd estimate; then FH_prior on all labels

Loss = mean over the family's groups of MSE against each group's full weighted share, over R draws.
Plan and predictions: LOG.md, 2026-11-13 (written before this ran).
Writes results/cells.csv, results/families.csv (family x nbar x strategy) and results/groups.csv.
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
NBARS = (50, 100, 200, 400)
STRATS = ('M_eq', 'D_eq', 'D_ney', 'C_or', 'FH_fam', 'FH_prior', 'FH2')


# ---------- pure helpers (tested in test_allocation.py) ----------

def water_fill(sd, nstar, budget, lo, hi, iters=100):
    """Real-valued n_g = clip(sd_g * lam - nstar_g, lo_g, hi_g) with sum n_g = budget (bisection on lam).
    With nstar = 0 and lo = 0 it is Neyman allocation; it minimises sum_g b^2 v/(b^2 + v), v = sd^2/n."""
    sd, nstar, lo, hi = (np.asarray(a, float) for a in (sd, nstar, lo, hi))
    budget = min(max(budget, lo.sum()), hi.sum())
    a, b = 0.0, 1.0
    while np.clip(sd * b - nstar, lo, hi).sum() < budget and b < 1e12:
        b *= 2
    for _ in range(iters):
        m = 0.5 * (a + b)
        if np.clip(sd * m - nstar, lo, hi).sum() < budget:
            a = m
        else:
            b = m
    return np.clip(sd * b - nstar, lo, hi)


def round_alloc(x, budget, hi):
    """Integer allocation summing to budget (largest remainders), each at most hi."""
    n = np.floor(x).astype(int)
    hi = np.asarray(hi, int)
    order = np.argsort(-(x - n))
    k = 0
    while n.sum() < budget and k < 10 * len(n):
        g = order[k % len(n)]
        if n[g] < hi[g]:
            n[g] += 1
        k += 1
    return n


def wmean(x, w):
    return float((w * x).sum() / w.sum())


def wvar_mean(x, w):
    """Linearised variance of a weighted (Hajek) mean, with the n/(n-1) correction."""
    n = len(x)
    if n < 2:
        return np.inf
    xb = wmean(x, w)
    return float((w ** 2 * (x - xb) ** 2).sum() / w.sum() ** 2 * n / (n - 1))


def fh_gamma(tau2, v):
    """Fay-Herriot shrinkage weight on the residual mean; 0 when tau2 = 0, 1 when v = 0."""
    tau2, v = np.asarray(tau2, float), np.asarray(v, float)
    den = tau2 + v
    return np.where(den > 0, tau2 / np.where(den > 0, den, 1), 1.0)


def tau2_moments(rbar, vhat):
    """Method-of-moments between-group variance of the bias: max(0, mean(rbar^2 - vhat))."""
    return max(0.0, float(np.mean(np.asarray(rbar) ** 2 - np.asarray(vhat))))


def kish_deff(w):
    return float(len(w) * (w ** 2).sum() / w.sum() ** 2)


def wvar(x, w):
    m = np.average(x, weights=w)
    return float(np.average((x - m) ** 2, weights=w))


# ---------- stage 1: fit the cells ----------

def fit_pair(args):
    name, kind, S, T, items = args
    out = []
    for j in items:
        s, t = S[S[j].notna()], T[T[j].notna()]
        feats = [f for f in gss.features_for(j) if s[f].notna().sum() >= 2]
        if len(s) < sb.MIN_S or len(t) < sb.MIN_T or s[j].nunique() < 2 or t[j].nunique() < 2:
            continue
        m = sb.hgb(feats).fit(s[feats].values.astype(float), s[j].values, sample_weight=s.w.values)
        f = m.predict_proba(t[feats].values.astype(float))[:, 1]
        out.append(dict(pair=name, kind=kind, item=j, y=t[j].values.astype(float), f=f,
                        w=t.w.values.astype(float)))
        print(name, j, flush=True)
    return out


def family_of(pair, kind):
    if kind == 'tradition':
        return 'tradition: ' + pair.split(' -> ')[0]
    if kind in ('period', 'generation'):
        return kind
    return None


# ---------- stage 2: simulate a family ----------

def simulate_family(args):
    fam, item, groups, tau2_prior, reps = args
    G = len(groups)
    N = np.array([len(g['y']) for g in groups])
    cap = N // 2
    theta = np.array([wmean(g['y'], g['w']) for g in groups])
    e0 = np.array([wmean(g['f'], g['w']) for g in groups])
    b = e0 - theta
    sd = np.array([np.sqrt(wvar(g['y'] - g['f'], g['w']) * kish_deff(g['w'])) for g in groups])
    rng = np.random.default_rng(zlib.crc32(f'{fam}|{item}'.encode()))
    fam_rows, grp_rows = [], []
    for nbar in NBARS:
        if (cap < nbar).any():
            continue
        B = G * nbar
        n_eq = np.full(G, nbar)
        n_ney = round_alloc(water_fill(sd, np.zeros(G), B, np.zeros(G), cap), B, cap)
        nstar_or = sd ** 2 / np.maximum(b ** 2, 1e-12)
        n_or = round_alloc(water_fill(sd, nstar_or, B, np.zeros(G), cap), B, cap)
        n0 = nbar // 2
        err = {s: np.zeros((reps, G)) for s in STRATS}
        n_fh2 = np.zeros((reps, G))
        for r in range(reps):
            perms = [rng.permutation(N[g]) for g in range(G)]

            def stats(g, n):
                i = perms[g][:n]
                y, f, w = groups[g]['y'][i], groups[g]['f'][i], groups[g]['w'][i]
                return wmean(y, w), wmean(y - f, w), wvar_mean(y - f, w)

            eq = [stats(g, nbar) for g in range(G)]
            mbar = np.array([e[0] for e in eq])
            rbar = np.array([e[1] for e in eq])
            vh = np.array([e[2] for e in eq])
            err['M_eq'][r] = mbar - theta
            err['D_eq'][r] = e0 + rbar - theta
            err['D_ney'][r] = [e0[g] + stats(g, n_ney[g])[1] - theta[g] for g in range(G)]
            for g in range(G):
                if n_or[g] == 0:
                    err['C_or'][r, g] = e0[g] - theta[g]
                else:
                    v = sd[g] ** 2 / n_or[g]
                    gam = b[g] ** 2 / (b[g] ** 2 + v)
                    err['C_or'][r, g] = e0[g] + gam * stats(g, n_or[g])[1] - theta[g]
            err['FH_fam'][r] = e0 + fh_gamma(tau2_moments(rbar, vh), vh) * rbar - theta
            err['FH_prior'][r] = e0 + fh_gamma(tau2_prior, vh) * rbar - theta
            # FH2: equal pilot of n0, water-fill the remaining budget on posterior b^2
            pil = [stats(g, n0) for g in range(G)]
            rp, vp = np.array([p[1] for p in pil]), np.array([p[2] for p in pil])
            g0 = fh_gamma(tau2_prior, vp)
            eb2 = (g0 * rp) ** 2 + g0 * vp
            sdh = np.sqrt(vp * n0)
            n2 = round_alloc(water_fill(sdh, sdh ** 2 / np.maximum(eb2, 1e-12), B,
                                        np.full(G, n0), cap), B, cap)
            n_fh2[r] = n2
            fin = [stats(g, n2[g]) for g in range(G)]
            rf, vf = np.array([p[1] for p in fin]), np.array([p[2] for p in fin])
            err['FH2'][r] = e0 + fh_gamma(tau2_prior, vf) * rf - theta
        for s in STRATS:
            mse = (err[s] ** 2).mean(0)
            fam_rows.append(dict(family=fam, item=item, G=G, nbar=nbar, strategy=s,
                                 loss=float(mse.mean()), worst_rmse=float(np.sqrt(mse.max())),
                                 mean_rmse=float(np.sqrt(mse).mean())))
            for g in range(G):
                grp_rows.append(dict(family=fam, item=item, pair=groups[g]['pair'], nbar=nbar, strategy=s,
                                     rmse=float(np.sqrt(mse[g])), bias_E0=float(b[g]), sd=float(sd[g]),
                                     n=float({'D_ney': n_ney[g], 'C_or': n_or[g],
                                              'FH2': n_fh2[:, g].mean()}.get(s, nbar))))
    print(fam, item, 'done', flush=True)
    return fam_rows, grp_rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--reps', type=int, default=300)
    ap.add_argument('--quick', action='store_true', help='period and one tradition family, 50 draws')
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    d = gss.load()
    d = d[d.tradition.isin(sb.TRADS)].reset_index(drop=True)
    jobs = []
    for name, kind, sm, tm in sb.pairs(d):
        if family_of(name, kind) is None:
            continue
        if a.quick and not (kind == 'period' or name.startswith('Catholic ->')):
            continue
        catholic_both = kind == 'generation' or name.startswith('Catholic <=')
        items = list(gss.TARGETS) + (list(gss.CATHOLIC_ONLY) if catholic_both else [])
        jobs.append((name, kind, d[sm], d[tm], items))
    with ProcessPoolExecutor(a.jobs) as ex:
        cells = [c for cs in ex.map(fit_pair, jobs) for c in cs]
    for c in cells:
        c['family'] = family_of(c['pair'], c['kind'])
        c['bias'] = wmean(c['f'], c['w']) - wmean(c['y'], c['w'])
    ctab = pd.DataFrame([{k: c[k] for k in ('family', 'kind', 'pair', 'item', 'bias')} | {'N': len(c['y'])}
                         for c in cells])
    fams = {}
    for c in cells:
        fams.setdefault((c['family'], c['item']), []).append(c)
    sjobs = []
    for (fam, item), gs in fams.items():
        if len(gs) < 2:
            continue
        kind = gs[0]['kind']
        other = ctab[(ctab.kind == kind) & (ctab.item != item)]
        sjobs.append((fam, item, gs, float((other.bias ** 2).mean()), 50 if a.quick else a.reps))
    with ProcessPoolExecutor(a.jobs) as ex:
        res = list(ex.map(simulate_family, sjobs))
    sfx = '_quick' if a.quick else ''
    ctab.to_csv(OUT / f'cells{sfx}.csv', index=False)
    pd.DataFrame([r for fr, _ in res for r in fr]).to_csv(OUT / f'families{sfx}.csv', index=False)
    pd.DataFrame([r for _, gr in res for r in gr]).to_csv(OUT / f'groups{sfx}.csv', index=False)
    print('done')


if __name__ == '__main__':
    main()

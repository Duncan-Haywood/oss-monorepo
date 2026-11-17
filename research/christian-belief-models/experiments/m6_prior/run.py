#!/usr/bin/env python3
"""Milestone 6 (part): can the other subgroups' and items' misses tell the shrinkage estimator which
group is biased?

    python3 experiments/m6_prior/run.py

No microdata. Reads ../m6_allocation/results/cells.csv (the transferred model's bias b for every
source->target pair x item) and ../m6_intervals/results/groups.csv (per group x budget: residual sd
with the Kish design effect, nbar).

Scenario: item j is rotated off one subgroup (cell p, j); every other cell's bias is known. A prior
gives a mean m and a variance tau2; the composite E0 + m + gamma (D - E0 - m), gamma = tau2/(tau2 + v),
has error (1 - gamma)(b - m) + gamma sqrt(v) Z, so MSE and interval coverage follow from the m6_intervals
helpers with b replaced by b - m. tau2 of a prior = mean squared error of the same prior on the same
kind's cells on other items, each predicted with its own cell and the target cell hidden (nested).

Priors: P0 (m = 0, tau2 = same-kind mean b^2 on other items; the existing FH_prior), GRP (m = 0,
tau2 = the pair's own mean b^2 on other items), COL (same-kind other pairs' mean on item j), ADD
(within-kind two-way additive fit), LR (rank-2 hard-impute of the column-centred matrix), and the
oracle composite (known b) as the floor.

Plan and predictions: LOG.md, 2026-11-15 (written before this ran).
Writes results/groups.csv, results/summary.md and results/mse_by_budget.svg.
"""
import importlib.util
import math
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
OUT = HERE / 'results'
sys.path.insert(0, str(HERE.parents[2] / '_shared'))
from linefig import svg_lines  # noqa: E402

_sp = importlib.util.spec_from_file_location('m6_int', EXP / 'm6_intervals' / 'run.py')
iv = importlib.util.module_from_spec(_sp)
sys.modules['m6_int'] = iv
_sp.loader.exec_module(iv)

PRIORS = ('P0', 'GRP', 'COL', 'ADD', 'LR', 'SEL')
INFORMATIVE = ('COL', 'ADD', 'LR')
LABEL = {'P0': 'zero mean, kind tau2 (FH_prior)', 'GRP': 'zero mean, own-pair tau2',
         'COL': 'other pairs on the item', 'ADD': 'additive pair + item', 'LR': 'rank-2 completion',
         'SEL': 'smallest leave-out error (post hoc)'}


# ---------- pure helpers (tested in test_prior.py) ----------

def pred_col(B, kinds, p, j):
    """Mean of the same kind's other pairs on item j (nan cells skipped)."""
    same = [q for q in B.index if q != p and kinds[q] == kinds[p]]
    x = B.loc[same, j].dropna()
    return float(x.mean()) if len(x) else 0.0


def additive_fit(M, iters=200):
    """mu + r_q + c_k fitted to the non-nan cells of M by alternating means (least squares)."""
    obs = ~np.isnan(M)
    mu = np.nanmean(M) if obs.any() else 0.0
    r = np.zeros(M.shape[0])
    c = np.zeros(M.shape[1])
    Z = np.where(obs, M, 0.0)
    for _ in range(iters):
        res = Z - mu - c[None, :]
        r = np.where(obs.sum(1) > 0, (res * obs).sum(1) / np.maximum(obs.sum(1), 1), 0.0)
        res = Z - mu - r[:, None]
        c = np.where(obs.sum(0) > 0, (res * obs).sum(0) / np.maximum(obs.sum(0), 1), 0.0)
        mu = float(((Z - r[:, None] - c[None, :]) * obs).sum() / max(obs.sum(), 1))
    return mu, r, c


def pred_add(B, kinds, p, j):
    same = [q for q in B.index if kinds[q] == kinds[p]]
    sub = B.loc[same]
    M = sub.to_numpy(float)
    mu, r, c = additive_fit(M)
    i, k = same.index(p), list(B.columns).index(j)
    return float(mu + r[i] + c[k])


def hard_impute(M, rank=2, iters=60):
    """Column-centred rank-k hard-impute of the nan cells of M; returns the completed matrix."""
    obs = ~np.isnan(M)
    cm = np.array([np.nanmean(M[:, k]) if obs[:, k].any() else 0.0 for k in range(M.shape[1])])
    X = np.where(obs, M - cm, 0.0)
    L = X
    for _ in range(iters):
        U, s, Vt = np.linalg.svd(X, full_matrices=False)
        L = (U[:, :rank] * s[:rank]) @ Vt[:rank]
        X = np.where(obs, M - cm, L)
    return L + cm


def pred_lr(B, kinds, p, j):
    M = B.to_numpy(float)
    L = hard_impute(M)
    return float(L[list(B.index).index(p), list(B.columns).index(j)])


PRED = {'COL': pred_col, 'ADD': pred_add, 'LR': pred_lr}


def priors_for(B, kinds, p, j):
    """Prior mean and tau2 for target cell (p, j) under every prior, using only other cells."""
    out = {}
    others = [(q, k) for q in B.index for k in B.columns
              if kinds[q] == kinds[p] and k != j and not np.isnan(B.loc[q, k])]
    out['P0'] = (0.0, float(np.mean([B.loc[q, k] ** 2 for q, k in others])))
    own = B.loc[p].drop(j).dropna()
    out['GRP'] = (0.0, float((own ** 2).mean()))
    Bh = B.copy()
    Bh.loc[p, j] = np.nan
    for name, f in PRED.items():
        m = f(Bh, kinds, p, j)
        errs = []
        for q, k in others:
            Bn = Bh.copy()
            Bn.loc[q, k] = np.nan
            errs.append(B.loc[q, k] - f(Bn, kinds, q, k))
        out[name] = (m, float(np.mean(np.square(errs))))
    return out


def group_stats(b, sd, n, m, tau2):
    st = iv.interval_stats(b - m, sd, n, tau2)
    return {'mse': st['rmse_analytic'] ** 2, 'cov_naive': st['cov_FH_naive'],
            'cov_robust': st['cov_FH_robust'], 'hw_robust': st['hw_FH_robust'], 'v': st['v']}


# ---------- run ----------

def _one(args):
    B, kinds, p, j = args
    return (p, j), priors_for(B, kinds, p, j)


def main():
    OUT.mkdir(exist_ok=True)
    cells = pd.read_csv(EXP / 'm6_allocation' / 'results' / 'cells.csv')
    B = cells.pivot_table(index='pair', columns='item', values='bias', aggfunc='first')
    kinds = cells.drop_duplicates('pair').set_index('pair').kind.to_dict()
    gr = pd.read_csv(EXP / 'm6_intervals' / 'results' / 'groups.csv')
    targets = sorted(set(zip(gr.pair, gr.item)))
    with ProcessPoolExecutor(4) as ex:
        pri = dict(ex.map(_one, [(B, kinds, p, j) for p, j in targets], chunksize=4))
    rows = []
    for r in gr.itertuples():
        pr = pri[(r.pair, r.item)]
        d = dict(family=r.family, kind=r.kind, item=r.item, pair=r.pair, nbar=r.nbar, bias=r.bias, sd=r.sd)
        v = r.sd ** 2 / r.nbar
        d['mse_D'] = v
        d['mse_oracle'] = r.bias ** 2 * v / (r.bias ** 2 + v) if r.bias else 0.0
        for name, (m, t2) in pr.items():
            st = group_stats(r.bias, r.sd, r.nbar, m, t2)
            d[f'm_{name}'], d[f'tau2_{name}'] = m, t2
            for key in ('mse', 'cov_naive', 'cov_robust', 'hw_robust'):
                d[f'{key}_{name}'] = st[key]
        # SEL (added after the pre-registered run, a diagnostic): per target, the prior whose nested
        # leave-out error tau2 on the same kind's other items is smallest; it never sees the target cell
        sel = min(('P0',) + INFORMATIVE, key=lambda a: pr[a][1])
        d['sel'] = sel
        for key in ('m', 'tau2', 'mse', 'cov_naive', 'cov_robust', 'hw_robust'):
            d[f'{key}_SEL'] = d[f'{key}_{sel}']
        rows.append(d)
    g = pd.DataFrame(rows)
    g.to_csv(OUT / 'groups.csv', index=False)
    summarise(g)


def ratio(x, a, b):
    return x[f'mse_{a}'].mean() / x[f'mse_{b}'].mean()


def boot(x, a, b, reps=2000, seed=0):
    """Item-cluster bootstrap 95% interval of the mean-MSE ratio a/b."""
    rng = np.random.default_rng(seed)
    items = x.item.unique()
    by = {i: x[x.item == i] for i in items}
    out = []
    for _ in range(reps):
        s = pd.concat([by[i] for i in rng.choice(items, len(items))])
        out.append(ratio(s, a, b))
    return np.quantile(out, [.025, .975])


def summarise(g):
    nb = sorted(g.nbar.unique())
    head = '| prior | ' + ' | '.join(f'n&#772; = {n}' for n in nb) + ' |'
    sep = '|---|' + '---:|' * len(nb)
    L = ['# Milestone 6 (part): a prior mean for the shrinkage estimator from other cells (generated by run.py)', '',
         f'{g[["pair", "item"]].drop_duplicates().shape[0]} groups; rows per n&#772;: '
         + ', '.join(f'{n}: {(g.nbar == n).sum()}' for n in nb)
         + '. Exact under the normal approximation given each group\'s bias. Ratios are mean group MSE over '
         'the reference\'s mean group MSE; item-cluster bootstrap 95% in brackets.', '',
         '## Mean MSE over the difference estimator D\'s', '', head, sep]
    for a in PRIORS + ('oracle',):
        L.append(f'| {a}: {LABEL.get(a, "known bias (floor)")} | ' + ' | '.join(
            f'{ratio(g[g.nbar == n], a, "D"):.3f}' for n in nb) + ' |')
    L += ['', '## Mean MSE over P0\'s', '', head, sep]
    for a in PRIORS[1:] + ('oracle',):
        cells = []
        for n in nb:
            x = g[g.nbar == n]
            lo, hi = boot(x, a, 'P0')
            cells.append(f'{ratio(x, a, "P0"):.3f} ({lo:.2f}&ndash;{hi:.2f})')
        L.append(f'| {a} | ' + ' | '.join(cells) + ' |')
    L += ['', '## By kind at n&#772; = 50: mean MSE over P0\'s', '',
          '| kind | groups | ' + ' | '.join(PRIORS[1:]) + ' | oracle |', '|---|---:|' + '---:|' * len(PRIORS)]
    g50 = g[g.nbar == 50]
    for k, x in g50.groupby('kind'):
        L.append(f'| {k} | {len(x)} | ' + ' | '.join(f'{ratio(x, a, "P0"):.3f}' for a in PRIORS[1:] + ('oracle',)) + ' |')
    L += ['', '## Prior quality: RMS of b &minus; m, points (all groups, n&#772; = 50 rows)', '',
          '| kind | ' + ' | '.join(PRIORS) + ' |', '|---|' + '---:|' * len(PRIORS)]
    for k, x in list(g50.groupby('kind')) + [('all', g50)]:
        L.append(f'| {k} | ' + ' | '.join(
            f'{100 * math.sqrt(((x.bias - x["m_" + a]) ** 2).mean()):.1f}' for a in PRIORS) + ' |')
    L += ['', '## SEL (diagnostic, not pre-registered): which prior it picks, share of n&#772; = 50 groups by kind', '',
          '| kind | ' + ' | '.join(('P0',) + INFORMATIVE) + ' |', '|---|' + '---:|' * 4]
    for k, x in g50.groupby('kind'):
        L.append(f'| {k} | ' + ' | '.join(f'{(x.sel == a).mean():.0%}' for a in ('P0',) + INFORMATIVE) + ' |')
    L += ['', '## Robust EB interval: mean coverage (share of groups below 80%)', '', head, sep]
    for a in PRIORS:
        L.append(f'| {a} | ' + ' | '.join(
            f'{g[g.nbar == n]["cov_robust_" + a].mean():.1%} ({(g[g.nbar == n]["cov_robust_" + a] < .8).mean():.0%})'
            for n in nb) + ' |')
    L += ['', '## Robust EB interval: median half-width, points', '', head, sep]
    for a in PRIORS:
        L.append(f'| {a} | ' + ' | '.join(f'{100 * g[g.nbar == n]["hw_robust_" + a].median():.2f}' for n in nb) + ' |')
    big = g50[g50.bias ** 2 / g50.tau2_P0 > 4]
    L += ['', f'## The {len(big)} large-bias groups (b<sup>2</sup> &gt; 4&tau;<sup>2</sup> under P0), n&#772; = 50', '',
          '| prior | mean robust coverage | mean naive coverage | mean MSE over P0\'s |', '|---|---:|---:|---:|']
    for a in PRIORS:
        L.append(f'| {a} | {big["cov_robust_" + a].mean():.1%} | {big["cov_naive_" + a].mean():.1%} | '
                 f'{ratio(big, a, "P0"):.3f} |')
    best = min(INFORMATIVE, key=lambda a: ratio(g50, a, 'P0'))
    per = g50[g50.kind == 'period']
    bestp = min(INFORMATIVE, key=lambda a: ratio(per, a, 'P0'))
    L += ['', '## Prediction checks (LOG.md, 2026-11-15)', '',
          f'1. period: best of COL/ADD/LR at most 0.80 of P0 at 50: {bestp} {ratio(per, bestp, "P0"):.3f}',
          f'2. all groups: best informative at most 0.85 of P0 at 50: {best} {ratio(g50, best, "P0"):.3f}; '
          'by n&#772;: ' + ', '.join(f'{n}: {ratio(g[g.nbar == n], best, "P0"):.3f}' for n in nb),
          '3. GRP within 5% of P0 at every n&#772;: ' + ', '.join(
              f'{ratio(g[g.nbar == n], "GRP", "P0"):.3f}' for n in nb),
          f'4. robust coverage around {best} at least 94% at every n&#772;: ' + ', '.join(
              f'{g[g.nbar == n]["cov_robust_" + best].mean():.1%}' for n in nb)
          + f'; large-bias groups at least 75% at 50: {big["cov_robust_" + best].mean():.1%}',
          f'5. LR no better than ADD by more than 0.03 (ratio to P0 at 50): LR {ratio(g50, "LR", "P0"):.3f}, '
          f'ADD {ratio(g50, "ADD", "P0"):.3f}',
          f'Refutation (no informative prior at most 0.95 of P0 at 50): '
          + ', '.join(f'{a} {ratio(g50, a, "P0"):.3f}' for a in INFORMATIVE)]
    (OUT / 'summary.md').write_text('\n'.join(L) + '\n')
    (OUT / 'mse_by_budget.svg').write_text(svg_lines(
        'Mean subgroup MSE of the shrinkage estimator relative to the difference estimator, by prior',
        'Mean MSE ratio to the difference estimator against calibration respondents per group, for five '
        'priors and the known-bias oracle',
        'calibration respondents per group (log scale)', 'mean MSE / difference estimator\'s',
        [(f'{a}: {LABEL.get(a, "known bias")}', nb, [ratio(g[g.nbar == n], a, 'D') for n in nb])
         for a in PRIORS + ('oracle',)], logx=True, hline=1.0))
    print('\n'.join(L))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Milestone 6 (part): can the shrinkage estimator's interval be trusted in each subgroup?

    python3 experiments/m6_intervals/run.py

No microdata. Reads ../m6_allocation/results/groups.csv (per group x budget: the transferred model's
bias b = E0 - theta, the residual sd with the Kish design effect, the simulated FH_prior RMSE) and
../m6_allocation/results/cells.csv (every cell's bias, for tau2 as m6_allocation set it: the mean b^2
of the same kind's cells on the family's other items).

Under the normal approximation the FH_prior error in a group is e = (1 - gamma) b + gamma sqrt(v) Z,
with v = sd^2 / n, gamma = tau2 / (tau2 + v) and the residual mean rbar = -b + sqrt(v) Z. Each
interval's coverage given b is then computed exactly (closed form, or a quadrature over Z):

  D          difference estimator E0 + rbar +- z sqrt(v)                  (95% by construction)
  FH_naive   FH_prior +- z sqrt(gamma v)                                  (posterior sd, tau2 known)
  FH_robust  FH_prior +- cva(v / tau2) gamma sqrt(v)                      (Armstrong, Kolesar and
             Plagborg-Moller 2022: coverage >= 95% on average over groups whose normalised bias
             (1 - gamma) b / (gamma sqrt v) has second moment v / tau2, whatever its distribution)
  FH_cmse    FH_prior +- z sqrt(gamma^2 v + (1 - gamma)^2 max(0, rbar^2 - v))  (plug-in conditional MSE)

Plan and predictions: LOG.md, 2026-11-14 (written before this ran).
Writes results/groups.csv, results/summary.md and results/coverage_by_budget.svg.
"""
import math
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ALLOC = HERE.parent / 'm6_allocation' / 'results'
OUT = HERE / 'results'
sys.path.insert(0, str(HERE.parents[2] / '_shared'))
from linefig import svg_lines  # noqa: E402

Z95 = 1.959963984540054
METHODS = ('D', 'FH_naive', 'FH_robust', 'FH_cmse')
LABEL = {'D': 'difference estimator', 'FH_naive': 'shrinkage, naive interval',
         'FH_robust': 'shrinkage, robust EB interval', 'FH_cmse': 'shrinkage, conditional-MSE interval'}

# ---------- pure helpers (tested in test_intervals.py) ----------

_erf = np.frompyfunc(math.erf, 1, 1)


def Phi(x):
    return 0.5 * (1.0 + np.asarray(_erf(np.asarray(x, float) / math.sqrt(2.0)), float))


def noncov(t, chi):
    """P(|Z + b| > chi) for b^2 = t: the non-coverage of a normalised interval with bias sqrt(t)."""
    b = np.sqrt(np.asarray(t, float))
    return Phi(-chi - b) + Phi(b - chi)


_T_GRID = np.unique(np.concatenate([[1.0], np.geomspace(1.0, 1e5, 400)]))


def rho(m2, chi):
    """Maximal average non-coverage over bias distributions with E[b^2] = m2 (Armstrong, Kolesar and
    Plagborg-Moller 2022, the second-moment-only case): the concave envelope of t -> noncov(t, chi)
    at m2, attained by a two-point distribution on {0, t}, t >= m2."""
    if m2 <= 0:
        return float(noncov(0.0, chi))
    t = m2 * _T_GRID
    r0 = float(noncov(0.0, chi))
    return float(max(noncov(m2, chi), np.max(r0 + (m2 / t) * (noncov(t, chi) - r0))))


def cva(m2, alpha=0.05):
    """Robust EB critical value: the smallest chi with rho(m2, chi) <= alpha (bisection)."""
    lo, hi = 0.0, Z95 * math.sqrt(1.0 + m2) + 10.0 * math.sqrt(max(m2, 1.0))
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if rho(m2, mid) > alpha:
            lo = mid
        else:
            hi = mid
    return hi


def cover(h, mu, s):
    """P(|mu + s Z| <= h)."""
    return Phi((h - mu) / s) - Phi((-h - mu) / s)


_ZG = np.linspace(-9, 9, 3601)
_WG = np.exp(-0.5 * _ZG ** 2)
_WG /= _WG.sum()


def interval_stats(b, sd, n, tau2):
    """Coverage given the bias b, and expected half-width, of each interval for one group."""
    v = sd ** 2 / n
    g = tau2 / (tau2 + v)
    mu, s = (1 - g) * b, g * math.sqrt(v)
    out = {'gamma': g, 'v': v, 'rmse_analytic': math.sqrt(mu ** 2 + s ** 2)}
    out['cov_D'], out['hw_D'] = 1 - 2 * float(Phi(-Z95)), Z95 * math.sqrt(v)
    h = Z95 * math.sqrt(g * v)
    out['cov_FH_naive'], out['hw_FH_naive'] = float(cover(h, mu, s)), h
    h = cva(v / tau2) * s
    out['cov_FH_robust'], out['hw_FH_robust'] = float(cover(h, mu, s)), h
    rbar = -b + math.sqrt(v) * _ZG
    e = mu + s * _ZG
    hz = Z95 * np.sqrt(g ** 2 * v + (1 - g) ** 2 * np.maximum(0.0, rbar ** 2 - v))
    out['cov_FH_cmse'] = float((_WG * (np.abs(e) <= hz)).sum())
    out['hw_FH_cmse'] = float((_WG * hz).sum())
    return out


def tau2_table(cells):
    """tau2 per (kind, item): mean squared bias of the same kind's cells on the other items."""
    return {(k, j): float((cells[(cells.kind == k) & (cells.item != j)].bias ** 2).mean())
            for k in cells.kind.unique() for j in cells.item.unique()}


def kind_of(family):
    return family.split(':')[0]


# ---------- run ----------

def main():
    OUT.mkdir(exist_ok=True)
    cells = pd.read_csv(ALLOC / 'cells.csv')
    gr = pd.read_csv(ALLOC / 'groups.csv')
    gr = gr[gr.strategy == 'FH_prior'].reset_index(drop=True)
    gr['kind'] = gr.family.map(kind_of)
    tau = tau2_table(cells)
    gr = gr.merge(cells[['pair', 'item', 'N']], on=['pair', 'item'], how='left')
    rows = []
    for r in gr.itertuples():
        t2 = tau[(r.kind, r.item)]
        st = interval_stats(r.bias_E0, r.sd, r.nbar, t2)
        # diagnostic only: the simulation drew without replacement from the N asked rows, so its
        # variance carries the finite-population factor (1 - n/N); a real subgroup is not finite
        vf = r.sd ** 2 / r.nbar * (1 - r.nbar / r.N)
        gf = t2 / (t2 + vf)
        st['rmse_analytic_fpc'] = math.sqrt(((1 - gf) * r.bias_E0) ** 2 + gf ** 2 * vf)
        rows.append(dict(family=r.family, kind=r.kind, item=r.item, pair=r.pair, nbar=r.nbar, N=r.N,
                         bias=r.bias_E0, sd=r.sd, tau2=t2, rmse_sim=r.rmse) | st)
    g = pd.DataFrame(rows)
    g.to_csv(OUT / 'groups.csv', index=False)
    summarise(g)


def summarise(g):
    nb = sorted(g.nbar.unique())
    rel = (g.rmse_analytic / g.rmse_sim - 1).abs()
    relf = (g.rmse_analytic_fpc / g.rmse_sim - 1).abs()
    head = '| interval | ' + ' | '.join(f'n&#772; = {n}' for n in nb) + ' |'
    sep = '|---|' + '---:|' * len(nb)
    L = ['# Milestone 6 (part): interval coverage for the shrinkage estimator (generated by run.py)', '',
         f'{g[["family", "item", "pair"]].drop_duplicates().shape[0]} groups in '
         f'{g[["family", "item"]].drop_duplicates().shape[0]} families; group x budget rows per n&#772;: '
         + ', '.join(f'{n}: {(g.nbar == n).sum()}' for n in nb)
         + '. Coverage is exact under the normal approximation, given each group\'s transferred-model '
         'bias; nominal 95%.', '',
         '## Check of the approximation', '',
         f'- analytic RMSE of FH_prior against the simulated one (300 draws, m6_allocation): median '
         f'|relative difference| {rel.median():.1%}, {(rel <= 0.10).mean():.1%} of rows within 10%, '
         f'90th percentile {rel.quantile(.9):.1%}; by n&#772;: '
         + ', '.join(f'{n}: {(rel[g.nbar == n] <= .10).mean():.1%}' for n in nb),
         f'- diagnostic (not pre-registered): with the finite-population factor 1 &minus; n/N that the '
         f'simulation\'s draws without replacement carry, median {relf.median():.1%}, '
         f'{(relf <= 0.10).mean():.1%} within 10%, 90th percentile {relf.quantile(.9):.1%}. Coverage below '
         'uses no such factor, since a real subgroup is not a finite list of asked rows.', '',
         '## Mean coverage over groups', '', head, sep]
    for m in METHODS:
        L.append(f'| {m}: {LABEL[m]} | ' + ' | '.join(f'{g[g.nbar == n]["cov_" + m].mean():.1%}' for n in nb) + ' |')
    L += ['', '## Share of groups covered below 80%', '', head, sep]
    for m in METHODS[1:]:
        L.append(f'| {m} | ' + ' | '.join(f'{(g[g.nbar == n]["cov_" + m] < .8).mean():.1%}' for n in nb) + ' |')
    L += ['', '## Lowest-decile coverage (10th percentile over groups)', '', head, sep]
    for m in METHODS[1:]:
        L.append(f'| {m} | ' + ' | '.join(f'{g[g.nbar == n]["cov_" + m].quantile(.1):.1%}' for n in nb) + ' |')
    L += ['', '## Median half-width relative to D\'s', '', head, sep]
    for m in METHODS[1:]:
        L.append(f'| {m} | ' + ' | '.join(
            f'{(g[g.nbar == n]["hw_" + m] / g[g.nbar == n].hw_D).median():.3f}' for n in nb) + ' |')
    L += ['', '## Median half-width, points', '', head, sep]
    for m in METHODS:
        L.append(f'| {m} | ' + ' | '.join(f'{100 * g[g.nbar == n]["hw_" + m].median():.2f}' for n in nb) + ' |')
    L += ['', '## By kind at n&#772; = 50: mean coverage (share below 80%)', '',
          '| kind | groups | rms bias, points | sqrt tau2, points | ' + ' | '.join(METHODS[1:]) + ' |',
          '|---|---:|---:|---:|' + '---:|' * 3]
    g50 = g[g.nbar == 50]
    for k, x in g50.groupby('kind'):
        L.append(f'| {k} | {len(x)} | {100 * math.sqrt((x.bias ** 2).mean()):.1f} | '
                 f'{100 * math.sqrt(x.tau2.mean()):.1f} | ' + ' | '.join(
                     f'{x["cov_" + m].mean():.1%} ({(x["cov_" + m] < .8).mean():.0%})' for m in METHODS[1:]) + ' |')
    L += ['', '## Coverage against how far a group\'s bias exceeds tau (n&#772; = 50)', '',
          '| b<sup>2</sup>/&tau;<sup>2</sup> | groups | ' + ' | '.join(METHODS[1:]) + ' |', '|---|---:|' + '---:|' * 3]
    ratio = g50.bias ** 2 / g50.tau2
    for lo, hi in ((0, .25), (.25, 1), (1, 4), (4, np.inf)):
        x = g50[(ratio >= lo) & (ratio < hi)]
        if len(x):
            L.append(f'| {lo} to {hi} | {len(x)} | ' + ' | '.join(f'{x["cov_" + m].mean():.1%}' for m in METHODS[1:]) + ' |')

    def mc(m, n):
        return g[g.nbar == n]['cov_' + m].mean()

    def mw(m, n):
        x = g[g.nbar == n]
        return (x['hw_' + m] / x.hw_D).median()
    kinds = g50.groupby('kind')['cov_FH_naive'].mean()
    L += ['', '## Prediction checks (LOG.md, 2026-11-14)', '',
          f'1. analytic RMSE within 10% of simulated in at least 90% of rows: {(rel <= .10).mean():.1%}',
          f'2. FH_naive mean coverage 85 to 92% at 50: {mc("FH_naive", 50):.1%}; at least 25% of groups '
          f'below 80%: {(g50.cov_FH_naive < .8).mean():.1%}',
          '3. FH_robust mean coverage at least 93% at every n&#772;: '
          + ', '.join(f'{mc("FH_robust", n):.1%}' for n in nb)
          + f'; at most 10% below 80% at 50: {(g50.cov_FH_robust < .8).mean():.1%}; median half-width '
          f'0.70 to 0.95 of D\'s at 50: {mw("FH_robust", 50):.3f}',
          f'4. FH_cmse mean coverage within 2 points of 95%: '
          + ', '.join(f'{mc("FH_cmse", n):.1%}' for n in nb)
          + '; median width above 0.95 of D\'s: ' + ', '.join(f'{mw("FH_cmse", n):.3f}' for n in nb),
          f'5. period lowest FH_naive coverage of the kinds at 50: '
          + ', '.join(f'{k} {v:.1%}' for k, v in kinds.items()),
          f'Refutation (FH_robust mean coverage below 90% at 50): {mc("FH_robust", 50):.1%}']
    (OUT / 'summary.md').write_text('\n'.join(L) + '\n')
    (OUT / 'coverage_by_budget.svg').write_text(svg_lines(
        'Mean coverage over subgroups of nominal 95% intervals for a shrunk subgroup share',
        'Mean coverage against calibration respondents per group for the difference estimator and three '
        'intervals around the shrinkage estimator',
        'calibration respondents per group (log scale)', 'mean coverage over groups',
        [(LABEL[m], nb, [mc(m, n) for n in nb]) for m in METHODS], logx=True, hline=0.95))
    print('\n'.join(L))


if __name__ == '__main__':
    main()

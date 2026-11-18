#!/usr/bin/env python3
"""Print-size figures for the milestone-6 paper draft, from the committed experiment CSVs.

    python3 paper/figures.py            # writes paper/figures/fig*.pdf and fig*.svg
    python3 paper/figures.py --check    # recompute the numbers each figure shows; no plotting

No microdata: every input is an `experiments/m6_*/results/*.csv` file already in the tree. Each
figure carries a check that recomputes, from the same CSV rows it plots, a number the paper quotes
from the experiment's `summary.md` (so a figure cannot silently drift from the text); `--check`
runs those checks alone and needs only numpy and pandas (also run by `test_figures.py`).

Sizes follow common journal columns (Sage: 3.5 in single, 7.0 in double column). Colours are the
Okabe-Ito palette, which stays distinguishable under the common colour-vision deficiencies, and
every series also differs by marker or line style, so the figures survive greyscale printing.
"""
import argparse
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
EXP = ROOT / 'experiments'
OUT = Path(__file__).resolve().parent / 'figures'

SINGLE, DOUBLE = 3.5, 7.0
OKABE = {'orange': '#E69F00', 'sky': '#56B4E9', 'green': '#009E73', 'yellow': '#F0E442',
         'blue': '#0072B2', 'vermillion': '#D55E00', 'purple': '#CC79A7', 'black': '#000000'}
KIND_STYLE = {  # kind -> (colour, marker, label)
    'generation': (OKABE['blue'], 'o', 'immigrant generation'),
    'ethnicity': (OKABE['purple'], 'D', 'Hispanic vs non-Hispanic'),
    'tradition': (OKABE['orange'], 's', 'tradition'),
    'period': (OKABE['green'], '^', 'period (2016–24)'),
}


def csv(exp, name):
    return pd.read_csv(EXP / exp / 'results' / name)


# ---------- data for each figure (pure; checked by --check and test_figures.py) ----------

def data_decomposition():
    """Fig. 1: covariate-shift part A against concept-shift part B of each cell's bias, points."""
    c = csv('m6_shift_bound', 'cells.csv')
    d = pd.DataFrame({'kind': c.kind, 'item': c.item, 'A': 100 * c.A, 'B': 100 * c.B,
                      'b': 100 * c.bias})
    checks = {'cells': len(d),
              'median |A|': round(float(d.A.abs().median()), 2),
              'median |B|': round(float(d.B.abs().median()), 2),
              'share |A| < |B|': round(float((d.A.abs() < d.B.abs()).mean()), 2),
              'max |A + B - b|': float((d.A + d.B - d.b).abs().max())}
    return d, checks


def crossover(g):
    """Same rule as m6_calibration/summarise.py: the n where D's RMSE falls to E0's |bias|,
    log-linear interpolation over the n grid; None if it does not cross inside the grid."""
    g = g.sort_values('n')
    r = (g.rmse_D / g.abs_bias_E0).values
    n = g.n.values
    for k in range(len(n) - 1):
        if r[k] >= 1 > r[k + 1]:
            a, b = np.log(r[k]), np.log(r[k + 1])
            return float(np.exp(np.log(n[k]) + (0 - a) / (b - a) * (np.log(n[k + 1]) - np.log(n[k]))))
    return None


def data_nstar():
    """Fig. 2: analytic break-even n* = var(y - f)/b^2 against the simulated crossover."""
    cells = csv('m6_calibration', 'cells.csv')
    sims = csv('m6_calibration', 'sims.csv')
    rows = []
    for (pair, item), g in sims.groupby(['pair', 'item']):
        x = crossover(g)
        if x is None:
            continue
        c = cells[(cells.pair == pair) & (cells.item == item)].iloc[0]
        rows.append({'kind': c.kind, 'item': item, 'n_star': c.n_star, 'sim': x})
    d = pd.DataFrame(rows)
    ratio = d.n_star / d.sim
    checks = {'cells': len(d),
              'within factor 2': round(float(((ratio >= 0.5) & (ratio <= 2)).mean()), 2),
              'median analytic/simulated': round(float(ratio.median()), 2),
              'median n* over all cells': round(float(cells.n_star.median()))}
    return d, checks


BUDGET_STRATS = [  # strategy, label, colour, marker, linestyle
    ('M_eq', 'plain mean', OKABE['black'], 'x', ':'),
    ('D_ney', 'difference, Neyman split', OKABE['sky'], 'v', '--'),
    ('FH_fam', r'shrinkage, $\tau^2$ from the family', OKABE['purple'], 'D', '-.'),
    ('FH_prior', r'shrinkage, $\tau^2$ from other items', OKABE['vermillion'], 'o', '-'),
    ('FH2', 'shrinkage, pilot then water-filled', OKABE['orange'], 's', '--'),
    ('C_or', 'oracle composite', OKABE['green'], '^', ':'),
]


def data_budget():
    """Fig. 3: median family loss over the equal-split difference estimator, by budget per group."""
    f = csv('m6_allocation', 'families.csv')
    base = f[f.strategy == 'D_eq'].set_index(['family', 'item', 'nbar']).loss
    f = f[f.strategy != 'D_eq'].join(base.rename('base'), on=['family', 'item', 'nbar'])
    f['ratio'] = f.loss / f.base
    d = f.groupby(['strategy', 'nbar']).ratio.median().unstack('nbar')
    checks = {'families at 50': int((f[(f.strategy == 'FH_prior')].nbar == 50).sum()),
              'FH_prior at 50': round(float(d.loc['FH_prior', 50]), 3),
              'FH_prior at 400': round(float(d.loc['FH_prior', 400]), 3),
              'D_ney at 50': round(float(d.loc['D_ney', 50]), 3)}
    return d, checks


INTERVALS = [('FH_naive', 'naive (posterior sd)', OKABE['sky'], 'v'),
             ('FH_robust', 'robust EB (Armstrong et al.)', OKABE['vermillion'], 'o'),
             ('FH_cmse', 'plug-in conditional MSE', OKABE['purple'], 's')]
BINS = [0, 0.25, 1, 4, np.inf]


def data_coverage():
    """Fig. 4: each group's exact coverage at nbar = 50 against b^2 / tau^2, with bin means."""
    g = csv('m6_intervals', 'groups.csv')
    g50 = g[g.nbar == 50].copy()
    g50['t'] = g50.bias ** 2 / g50.tau2
    g50['bin'] = pd.cut(g50.t, BINS, right=False)
    binned = g50.groupby('bin', observed=False)[[f'cov_{m}' for m, *_ in INTERVALS]].mean()
    checks = {'groups at 50': len(g50),
              'robust mean coverage at 50': round(float(g50.cov_FH_robust.mean()), 3),
              'robust, b2/tau2 >= 4': round(float(binned.cov_FH_robust.iloc[-1]), 3),
              'groups with b2/tau2 >= 4': int((g50.t >= 4).sum()),
              'robust/D half-width at 50': round(float((g50.hw_FH_robust / g50.hw_D).median()), 3)}
    return (g50, binned), checks


PRIORS = [('COL', "other traditions' miss", OKABE['green']),
          ('ADD', 'pair + item fit', OKABE['orange']),
          ('LR', 'regression on features', OKABE['sky'])]
KINDS3 = ['period', 'generation', 'tradition']


def data_priors():
    """Fig. 5: mean MSE of each prior over the zero prior's at nbar = 50, by kind, on the 13
    items the rule was read from (m6_prior) and on the 7 fresh primary items (m6_fresh_items)."""
    old = csv('m6_prior', 'groups.csv')
    old = old[old.nbar == 50]
    new = csv('m6_fresh_items', 'groups.csv')
    new = new[(new.nbar == 50) & new.primary]
    out = {}
    for name, x in (('in-sample', old), ('fresh', new)):
        for k in KINDS3:
            xk = x[x.kind == k]
            for a, *_ in PRIORS + [('oracle',)]:
                out[(name, k, a)] = float(xk[f'mse_{a}'].mean() / xk.mse_P0.mean())
        if name == 'fresh':
            out[(name, 'all', 'RULE')] = float(x.mse_RULE.mean() / x.mse_P0.mean())
    checks = {'period COL in-sample': round(out[('in-sample', 'period', 'COL')], 3),
              'period COL fresh': round(out[('fresh', 'period', 'COL')], 3),
              'generation LR fresh': round(out[('fresh', 'generation', 'LR')], 3),
              'RULE fresh, all': round(out[('fresh', 'all', 'RULE')], 3)}
    return out, checks


def data_design():
    """Fig. 6: D's total-error ratio to M against the population share, and against the sample
    share (phase 2 only), median over cells by n, with the subsample-only interval's inflation."""
    s = csv('m6_design_variance', 'sims.csv')
    d = s.groupby('n')[['total_ratio', 'phase2_ratio', 'inflation_D', 'share_V1_M']].median()
    checks = {'total ratio at 50': round(float(d.total_ratio[50]), 3),
              'total ratio at 400': round(float(d.total_ratio[400]), 3),
              'inflation at 400': round(float(d.inflation_D[400]), 3),
              'V1 share at 400': round(float(d.share_V1_M[400]), 3)}
    return d, checks


# The paper quotes these (paper/draft.md, from each experiment's summary.md); --check compares.
EXPECTED = {
    'decomposition': {'cells': 241, 'median |A|': 0.83, 'median |B|': 3.45, 'share |A| < |B|': 0.77},
    'nstar': {'cells': 137, 'within factor 2': 0.99, 'median analytic/simulated': 0.71,
              'median n* over all cells': 91},
    'budget': {'families at 50': 73, 'FH_prior at 50': 0.501, 'FH_prior at 400': 0.885,
               'D_ney at 50': 0.993},
    'coverage': {'groups at 50': 227, 'robust mean coverage at 50': 0.968,
                 'robust, b2/tau2 >= 4': 0.638, 'groups with b2/tau2 >= 4': 12,
                 'robust/D half-width at 50': 0.832},
    'priors': {'period COL in-sample': 0.259, 'period COL fresh': 0.383,
               'generation LR fresh': 0.787, 'RULE fresh, all': 0.846},
    'design': {'total ratio at 50': 0.834, 'total ratio at 400': 0.863, 'inflation at 400': 1.085,
               'V1 share at 400': 0.110},
}
DATA = {'decomposition': data_decomposition, 'nstar': data_nstar, 'budget': data_budget,
        'coverage': data_coverage, 'priors': data_priors, 'design': data_design}


def run_checks():
    """Recompute every figure's numbers; return a list of mismatch strings (empty = all agree)."""
    bad = []
    for name, fn in DATA.items():
        _, got = fn()
        for k, want in EXPECTED[name].items():
            if got[k] != want:
                bad.append(f'{name}: {k} = {got[k]}, paper says {want}')
        if name == 'decomposition' and got['max |A + B - b|'] > 1e-6:
            bad.append(f'decomposition: A + B differs from b by {got["max |A + B - b|"]}')
    return bad


# ---------- plotting ----------

def setup():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({
        'font.family': 'DejaVu Sans', 'font.size': 8, 'axes.titlesize': 8, 'axes.labelsize': 8,
        'legend.fontsize': 6.5, 'xtick.labelsize': 7, 'ytick.labelsize': 7, 'axes.linewidth': 0.6,
        'lines.linewidth': 1.0, 'lines.markersize': 3.5, 'axes.spines.top': False,
        'axes.spines.right': False, 'legend.frameon': False, 'pdf.fonttype': 42,
        'svg.fonttype': 'none', 'savefig.bbox': 'tight', 'savefig.pad_inches': 0.02,
        'svg.hashsalt': 'christian-belief-models', 'path.simplify': False})
    return plt


def save(fig, stem):
    OUT.mkdir(exist_ok=True)
    fig.savefig(OUT / f'{stem}.pdf', metadata={'CreationDate': None, 'ModDate': None})
    fig.savefig(OUT / f'{stem}.svg', metadata={'Date': None})


def fig_decomposition(plt):
    d, _ = data_decomposition()
    fig, ax = plt.subplots(figsize=(SINGLE, SINGLE * 0.85))
    lim = math.ceil(max(d.A.abs().max(), d.B.abs().max()) / 5) * 5
    for k, (col, mk, lab) in KIND_STYLE.items():
        x = d[d.kind == k]
        ax.scatter(x.B, x.A, s=9, c=col, marker=mk, label=f'{lab} ({len(x)})', linewidths=0.3,
                   edgecolors='white')
    ax.axhline(0, c='0.6', lw=0.5)
    ax.axvline(0, c='0.6', lw=0.5)
    ax.plot([-lim, lim], [-lim, lim], c='0.6', lw=0.5, ls=':')
    ax.plot([-lim, lim], [lim, -lim], c='0.6', lw=0.5, ls=':')
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim / 2, lim / 2)
    ax.set_xlabel('concept-shift part $B$, points')
    ax.set_ylabel('covariate-shift part $A$, points')
    ax.legend(loc='upper left', handletextpad=0.2)
    save(fig, 'fig1_decomposition')
    plt.close(fig)


def fig_nstar(plt):
    d, ch = data_nstar()
    fig, ax = plt.subplots(figsize=(SINGLE, SINGLE * 0.85))
    lo, hi = 10, 1000
    xs = np.array([lo, hi])
    ax.fill_between(xs, xs / 2, xs * 2, color='0.92', lw=0, label='within a factor of 2')
    ax.plot(xs, xs, c='0.5', lw=0.6, ls='--', label='$n^* =$ simulated')
    for k, (col, mk, lab) in KIND_STYLE.items():
        x = d[d.kind == k]
        if len(x):
            ax.scatter(x.sim, x.n_star, s=9, c=col, marker=mk, label=f'{lab} ({len(x)})',
                       linewidths=0.3, edgecolors='white')
    ax.set_xscale('log')
    ax.set_yscale('log')
    ax.set_xlim(lo, hi)
    ax.set_ylim(lo / 2, hi * 2)
    ax.set_xlabel('simulated crossover $n$ (500 subsamples per $n$)')
    ax.set_ylabel(r'analytic $n^* = \mathrm{var}(y-f)/b^2$')
    ax.legend(loc='upper left', handletextpad=0.2)
    save(fig, 'fig2_nstar')
    plt.close(fig)


def fig_budget(plt):
    d, _ = data_budget()
    fig, ax = plt.subplots(figsize=(SINGLE, SINGLE * 0.8))
    n = list(d.columns)
    ax.axhline(1, c='0.5', lw=0.6, ls='--')
    for s, lab, col, mk, ls in BUDGET_STRATS:
        ax.plot(n, d.loc[s, n], c=col, marker=mk, ls=ls, label=lab)
    ax.set_xscale('log')
    ax.set_xticks(n)
    ax.set_xticklabels([str(v) for v in n])
    ax.minorticks_off()
    ax.set_ylim(0, 1.35)
    ax.set_xlabel(r'calibration respondents per group, $\bar n$')
    ax.set_ylabel('family loss / difference estimator\'s\n(median over families)')
    ax.legend(loc='upper center', bbox_to_anchor=(0.45, -0.22), ncol=2, handletextpad=0.3,
              columnspacing=0.8)
    save(fig, 'fig3_budget')
    plt.close(fig)


def fig_coverage(plt):
    (g, binned), _ = data_coverage()
    fig, ax = plt.subplots(figsize=(SINGLE, SINGLE * 0.8))
    t = np.clip(g.t.values, 1e-3, None)
    for (m, lab, col, mk), jit in zip(INTERVALS, (0.93, 1.0, 1.07)):
        ax.scatter(t * jit, 100 * g[f'cov_{m}'], s=5, c=col, marker=mk, alpha=0.45, lw=0)
        mids = [0.1, 0.5, 2.0, 8.0]
        ax.plot(mids, 100 * binned[f'cov_{m}'].values, c=col, marker=mk, ms=4.5, label=lab)
    ax.axhline(95, c='0.4', lw=0.6, ls='--')
    for e in BINS[1:-1]:
        ax.axvline(e, c='0.85', lw=0.5)
    ax.set_xscale('log')
    ax.set_xlim(1e-3, 60)
    ax.set_ylim(0, 102)
    ax.set_xlabel(r'$b^2/\tau^2$ (group bias against the prior variance)')
    ax.set_ylabel(r'coverage, % (exact; $\bar n = 50$)')
    ax.legend(loc='lower left', handletextpad=0.3, title='lines: bin means', title_fontsize=6.5)
    save(fig, 'fig4_coverage')
    plt.close(fig)


def fig_priors(plt):
    d, _ = data_priors()
    fig, axes = plt.subplots(1, 2, figsize=(DOUBLE, DOUBLE * 0.32), sharey=True)
    w = 0.2
    for ax, name, title in zip(axes, ('in-sample', 'fresh'),
                               ('13 items the rule was read from', '7 fresh items (not used to choose)')):
        x = np.arange(len(KINDS3))
        for i, (a, lab, col) in enumerate(PRIORS):
            ax.bar(x + (i - 1) * w, [d[(name, k, a)] for k in KINDS3], w * 0.95, color=col,
                   label=lab, edgecolor='black', linewidth=0.3,
                   hatch=('', '///', '...')[i])
        ax.scatter(x + 1.75 * w, [d[(name, k, 'oracle')] for k in KINDS3], marker='_', s=60,
                   c='black', lw=1.2, label='oracle weight, zero mean', zorder=3)
        ax.axhline(1, c='0.4', lw=0.6, ls='--')
        ax.set_xticks(x)
        ax.set_xticklabels(KINDS3)
        ax.set_title(title)
        ax.set_ylim(0, 1.8)
    axes[0].set_ylabel('mean MSE / zero prior\'s ($\\bar n = 50$)')
    axes[1].legend(loc='upper right', ncol=2, handletextpad=0.3, columnspacing=0.8)
    fig.tight_layout(w_pad=1.0)
    save(fig, 'fig5_priors')
    plt.close(fig)


def fig_design(plt):
    d, _ = data_design()
    fig, ax = plt.subplots(figsize=(SINGLE, SINGLE * 0.75))
    n = list(d.index)
    ax.plot(n, d.phase2_ratio, c=OKABE['sky'], marker='v', ls='--',
            label='D / M, sample share (phase 2 only)')
    ax.plot(n, d.total_ratio, c=OKABE['vermillion'], marker='o',
            label='D / M, population share (with $V_1$)')
    ax.set_xscale('log')
    ax.set_xticks(n)
    ax.set_xticklabels([str(v) for v in n])
    ax.minorticks_off()
    ax.set_ylim(0.75, 0.95)
    ax.set_xlabel('calibration subsample size $n$')
    ax.set_ylabel('error variance ratio\n(median over cells)')
    ax2 = ax.twinx()
    ax2.spines['right'].set_visible(True)
    ax2.plot(n, d.inflation_D, c=OKABE['black'], marker='x', ls=':',
             label='Wald interval too narrow by (right)')
    ax2.set_ylim(1.0, 1.2)
    ax2.set_ylabel('interval inflation factor')
    h1, l1 = ax.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, loc='upper left', handletextpad=0.3)
    save(fig, 'fig6_design')
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='recompute the figures\' numbers only')
    args = ap.parse_args()
    bad = run_checks()
    for name, fn in DATA.items():
        print(f'{name}: ' + ', '.join(f'{k} {v}' for k, v in fn()[1].items()))
    if bad:
        print('MISMATCH\n' + '\n'.join(bad))
        sys.exit(1)
    print('all figure numbers match the paper')
    if args.check:
        return
    plt = setup()
    for f in (fig_decomposition, fig_nstar, fig_budget, fig_coverage, fig_priors, fig_design):
        f(plt)
    print(f'wrote {len(list(OUT.glob("fig*.pdf")))} PDF and SVG pairs to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()

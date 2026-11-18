#!/usr/bin/env python3
"""Milestone 6 (part): does the by-kind prior rule hold on GSS items it was never read from?

    python3 experiments/m6_fresh_items/run.py [--jobs 4] [--check]

Needs the GSS microdata (data/download.sh). The rule (period groups: COL, the same kind's other pairs'
miss on the item; immigrant generations: P0, zero; traditions: ADD, the additive pair + item fit) was
read off the 13 items of m6_prior / m6_kindsel. Here it is scored on fresh binary items, none of which is
among those 13 or among the model's features:

  primary (7)    letdie1, suicide1, cappun, grass, pornlaw, teensex, pillok
  secondary (6)  abdefect, abrape, absingle, abpoor, abnomore, abhlth (near-determined by abany, a feature)

Stage 1 fits, for each of the 19 pairs (m6_shift_bound.pairs without the ethnicity pair) and each fresh
item, the transferred model exactly as m6_allocation.fit_pair does, and keeps the bias b, N and the
residual sd with the Kish design effect. --check also refits the 13 old items and reports the largest
difference from m6_allocation/results/cells.csv (the pipeline must reproduce it).
Stage 2 appends one fresh column at a time to the old 19 x 13 bias matrix and gives each of its cells
every prior's (m, tau2) from m6_prior.priors_for with only that cell hidden. A cell enters at nbar when
its family has at least two cells on the item and every cell of the family has N // 2 >= nbar
(m6_allocation's rule). MSE and robust EB coverage: m6_prior.group_stats.

Plan and predictions: LOG.md, 2026-11-16, "fresh items" (written before this ran).
Writes results/cells.csv, results/groups.csv, results/summary.md and results/mse_by_budget.svg.
"""
import argparse
import importlib.util
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
ROOT = EXP.parent
OUT = HERE / 'results'
sys.path.insert(0, str(ROOT / 'src'))
sys.path.insert(0, str(HERE.parents[2] / '_shared'))
import gss  # noqa: E402
from linefig import svg_lines  # noqa: E402


def _load(name, path):
    sp = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(sp)
    sys.modules[name] = m
    sp.loader.exec_module(m)
    return m


sb = _load('m6_shift', EXP / 'm6_shift_bound' / 'run.py')
al = _load('m6_alloc', EXP / 'm6_allocation' / 'run.py')
pr = _load('m6_prior', EXP / 'm6_prior' / 'run.py')

# name: (GSS column, teaching-consistent answer, label). Codes checked against the file's value labels.
FRESH = {
    'euthanasia_no':   ('letdie1',  lambda x: x == 2, 'doctor should not end an incurable patient\'s life [CCC 2277]'),
    'suicide_no':      ('suicide1', lambda x: x == 2, 'no right to end own life if incurable [CCC 2281]'),
    'deathpen_oppose': ('cappun',   lambda x: x == 2, 'opposes the death penalty for murder [CCC 2267, 2018]'),
    'marijuana_no':    ('grass',    lambda x: x == 2, 'marijuana should not be legal [CCC 2291]'),
    'porn_ban_all':    ('pornlaw',  lambda x: x == 1, 'laws against pornography whatever the age [CCC 2354]'),
    'teensex_wrong':   ('teensex',  lambda x: x == 1, 'sex between teens 14-16 always wrong [CCC 2353]'),
    'teen_pill_no':    ('pillok',   lambda x: x >= 3, 'teens 14-16 should not get birth control without parents [CCC 2370, 2223]'),
}
SECONDARY = {f'{c}_no': (c, lambda x: x == 2, f'abortion not allowed: {c} [CCC 2271]')
             for c in ('abdefect', 'abrape', 'absingle', 'abpoor', 'abnomore', 'abhlth')}
ALL_FRESH = {**FRESH, **SECONDARY}
NA_CODES = {'teensex': [5]}  # 'other'
RULE = {'period': 'COL', 'generation': 'P0', 'tradition': 'ADD'}
SHOW = ('P0', 'COL', 'ADD', 'LR', 'RULE', 'oracle')


# ---------- pure helpers (tested in test_fresh_items.py) ----------

def recode_fresh(d, spec=ALL_FRESH):
    d = d.copy()
    for name, (src, f, _) in spec.items():
        x = d[src].where(~d[src].isin(NA_CODES.get(src, [])))
        d[name] = np.where(x.isna(), np.nan, f(x).astype(float))
    return d


def features(d, s):
    """All model features (no fresh item is a feature), minus those never observed on the source rows."""
    return [f for f in gss.DEMOG + gss.ITEMS if s[f].notna().sum() >= 2]


def eligible(cells, nbars):
    """(pair, item, nbar) rows that enter: family has >= 2 cells on the item and all have N // 2 >= nbar."""
    out = []
    for (fam, item), x in cells.groupby(['family', 'item']):
        if len(x) < 2:
            continue
        for n in nbars:
            if (x.N // 2 >= n).all():
                out += [(p, item, n) for p in x.pair]
    return out


def apply_rule(g):
    g = g.copy()
    pick = g.kind.map(RULE)
    for key in ('m', 'tau2', 'mse', 'cov_naive', 'cov_robust', 'hw_robust'):
        g[f'{key}_RULE'] = [g.at[i, f'{key}_{a}'] for i, a in zip(g.index, pick)]
    return g


# ---------- stage 1 ----------

def fit_pair(args):
    name, kind, S, T, items = args
    out = []
    for j in items:
        s, t = S[S[j].notna()], T[T[j].notna()]
        if len(s) < sb.MIN_S or len(t) < sb.MIN_T or s[j].nunique() < 2 or t[j].nunique() < 2:
            continue
        feats = features(None, s) if j in ALL_FRESH else [f for f in gss.features_for(j) if s[f].notna().sum() >= 2]
        m = sb.hgb(feats).fit(s[feats].values.astype(float), s[j].values, sample_weight=s.w.values)
        f = m.predict_proba(t[feats].values.astype(float))[:, 1]
        y, w = t[j].values.astype(float), t.w.values.astype(float)
        out.append(dict(family=al.family_of(name, kind), kind=kind, pair=name, item=j,
                        bias=al.wmean(f, w) - al.wmean(y, w), N=len(y), share=al.wmean(y, w),
                        sd=float(np.sqrt(al.wvar(y - f, w) * al.kish_deff(w)))))
    print(name, 'done', flush=True)
    return out


def stage1(jobs, check):
    cols = list(dict.fromkeys(gss.COLS + [v[0] for v in ALL_FRESH.values()]))
    d = pd.read_stata(gss.DTA, columns=cols, convert_categoricals=False)
    d = recode_fresh(gss.recode(d))
    d = d[d.tradition.isin(sb.TRADS)].reset_index(drop=True)
    work = []
    for name, kind, sm, tm in sb.pairs(d):
        if al.family_of(name, kind) is None:
            continue
        items = list(ALL_FRESH)
        if check:
            catholic_both = kind == 'generation' or name.startswith('Catholic <=')
            items += list(gss.TARGETS) + (list(gss.CATHOLIC_ONLY) if catholic_both else [])
        work.append((name, kind, d[sm], d[tm], items))
    with ProcessPoolExecutor(jobs) as ex:
        rows = [r for rs in ex.map(fit_pair, work) for r in rs]
    return pd.DataFrame(rows)


# ---------- stage 2 ----------

def _priors(args):
    B, kinds, p, j = args
    return (p, j), pr.priors_for(B, kinds, p, j)


def stage2(fresh, jobs):
    old = pd.read_csv(EXP / 'm6_allocation' / 'results' / 'cells.csv')
    B0 = old.pivot_table(index='pair', columns='item', values='bias', aggfunc='first')
    kinds = old.drop_duplicates('pair').set_index('pair').kind.to_dict()
    el = eligible(fresh, al.NBARS)
    targets = sorted({(p, j) for p, j, _ in el})
    args = []
    for p, j in targets:
        B = B0.copy()
        B[j] = fresh[fresh.item == j].set_index('pair').bias.reindex(B.index)
        args.append((B, kinds, p, j))
    with ProcessPoolExecutor(jobs) as ex:
        pri = dict(ex.map(_priors, args, chunksize=4))
    fx = fresh.set_index(['pair', 'item'])
    rows = []
    for p, j, n in el:
        c = fx.loc[(p, j)]
        d = dict(family=c.family, kind=c.kind, pair=p, item=j, primary=j in FRESH, nbar=n, N=c.N,
                 bias=c.bias, sd=c.sd)
        v = c.sd ** 2 / n
        d['mse_D'] = v
        d['mse_oracle'] = c.bias ** 2 * v / (c.bias ** 2 + v) if c.bias else 0.0
        for name, (m, t2) in pri[(p, j)].items():
            if name == 'SEL':
                continue
            st = pr.group_stats(c.bias, c.sd, n, m, t2)
            d[f'm_{name}'], d[f'tau2_{name}'] = m, t2
            for key in ('mse', 'cov_naive', 'cov_robust', 'hw_robust'):
                d[f'{key}_{name}'] = st[key]
        rows.append(d)
    return apply_rule(pd.DataFrame(rows))


# ---------- summary ----------

def summarise(g, fresh, check_line):
    ratio, boot = pr.ratio, pr.boot
    nb = sorted(g.nbar.unique())
    head = '| prior | ' + ' | '.join(f'n&#772; = {n}' for n in nb) + ' |'
    sep = '|---|' + '---:|' * len(nb)
    old = pd.read_csv(EXP / 'm6_allocation' / 'results' / 'cells.csv')
    L = ['# Milestone 6 (part): the by-kind prior rule on fresh GSS items (generated by run.py)', '',
         'RULE = period COL, generation P0, tradition ADD, fixed before this run (LOG.md, 2026-11-16). '
         'Ratios are mean group MSE over the reference\'s; item-cluster bootstrap 95% in brackets.', '',
         check_line, '',
         '## Fresh items: transferred-model miss (RMS of b, points) by kind', '',
         '| item | primary | period | generation | tradition | cells |', '|---|---|---:|---:|---:|---:|']
    for j, x in fresh.groupby('item', sort=False):
        rms = {k: 100 * np.sqrt((y.bias ** 2).mean()) for k, y in x.groupby('kind')}
        L.append(f'| {j} | {"yes" if j in FRESH else "no"} | ' + ' | '.join(
            f'{rms.get(k, float("nan")):.1f}' for k in ('period', 'generation', 'tradition')) + f' | {len(x)} |')
    rms_old = {k: 100 * np.sqrt((y.bias ** 2).mean()) for k, y in old.groupby('kind')}
    L.append('| *the 13 old items* | | ' + ' | '.join(f'{rms_old[k]:.1f}' for k in ('period', 'generation', 'tradition'))
             + f' | {len(old)} |')
    for label, sub in (('Primary set (7 items)', g[g.primary]), ('Secondary set (6 abortion sub-items)', g[~g.primary])):
        if sub.empty:
            continue
        L += ['', f'## {label}', '',
              f'{sub[["pair", "item"]].drop_duplicates().shape[0]} groups; rows per n&#772;: '
              + ', '.join(f'{n}: {(sub.nbar == n).sum()}' for n in nb), '',
              '### Mean MSE over the difference estimator D\'s', '', head, sep]
        for a in SHOW:
            L.append(f'| {a} | ' + ' | '.join(f'{ratio(sub[sub.nbar == n], a, "D"):.3f}' for n in nb) + ' |')
        L += ['', '### Mean MSE over P0\'s', '', head, sep]
        for a in SHOW[1:]:
            cs = []
            for n in nb:
                x = sub[sub.nbar == n]
                lo, hi = boot(x, a, 'P0')
                cs.append(f'{ratio(x, a, "P0"):.3f} ({lo:.2f}&ndash;{hi:.2f})')
            L.append(f'| {a} | ' + ' | '.join(cs) + ' |')
        s50 = sub[sub.nbar == 50]
        L += ['', '### By kind at n&#772; = 50: mean MSE over P0\'s (bootstrap 95%)', '',
              '| kind | groups | ' + ' | '.join(SHOW[1:]) + ' |', '|---|---:|' + '---:|' * len(SHOW[1:])]
        for k, x in s50.groupby('kind'):
            cs = []
            for a in SHOW[1:]:
                lo, hi = boot(x, a, 'P0')
                cs.append(f'{ratio(x, a, "P0"):.3f} ({lo:.2f}&ndash;{hi:.2f})')
            L.append(f'| {k} | {len(x)} | ' + ' | '.join(cs) + ' |')
        L += ['', '### By item at n&#772; = 50: mean MSE over P0\'s', '',
              '| item | groups | ' + ' | '.join(SHOW[1:]) + ' |', '|---|---:|' + '---:|' * len(SHOW[1:])]
        for j, x in s50.groupby('item'):
            L.append(f'| {j} | {len(x)} | ' + ' | '.join(f'{ratio(x, a, "P0"):.3f}' for a in SHOW[1:]) + ' |')
        L += ['', '### Robust EB interval: mean coverage (share of groups below 80%)', '', head, sep]
        for a in ('P0', 'COL', 'ADD', 'LR', 'RULE'):
            L.append(f'| {a} | ' + ' | '.join(
                f'{sub[sub.nbar == n]["cov_robust_" + a].mean():.1%} ({(sub[sub.nbar == n]["cov_robust_" + a] < .8).mean():.0%})'
                for n in nb) + ' |')
    p = g[g.primary]
    p50, p400 = p[p.nbar == 50], p[p.nbar == 400]
    bk = {k: x for k, x in p50.groupby('kind')}
    s50 = g[(~g.primary) & (g.nbar == 50)]
    L += ['', '## Prediction checks (LOG.md, 2026-11-16, fresh items; primary set)', '',
          f'1. RULE at most 0.85 of P0 at 50: {ratio(p50, "RULE", "P0"):.3f}; at most 1.02 at 400: '
          f'{ratio(p400, "RULE", "P0"):.3f}',
          f'2. period COL at most 0.60 of P0 at 50: {ratio(bk["period"], "COL", "P0"):.3f}',
          '3. generation COL, ADD, LR each at least 0.95 of P0 at 50: ' + ', '.join(
              f'{a} {ratio(bk["generation"], a, "P0"):.3f}' for a in ('COL', 'ADD', 'LR')),
          '4. tradition ADD/P0 interval at 50 includes 1: {:.3f} ({:.2f}&ndash;{:.2f})'.format(
              ratio(bk['tradition'], 'ADD', 'P0'), *boot(bk['tradition'], 'ADD', 'P0')),
          f'5. RULE at most ADD at 50: RULE {ratio(p50, "RULE", "P0"):.3f}, ADD {ratio(p50, "ADD", "P0"):.3f}',
          '6. RULE robust coverage at least 94% at every n&#772;: ' + ', '.join(
              f'{p[p.nbar == n]["cov_robust_RULE"].mean():.1%}' for n in nb),
          f'7. secondary set RULE below 1.0 of P0 at 50: {ratio(s50, "RULE", "P0"):.3f}' if len(s50) else
          '7. secondary set: no eligible groups',
          f'Refutation (RULE not at most 0.95 of P0 at 50, primary): {ratio(p50, "RULE", "P0"):.3f}']
    # post hoc (added after seeing the results, not pre-registered): LR did best on the primary set, so
    # how does a rule with LR for generations and traditions (period kept on COL) do, on both sets, and
    # how did the same variant do in-sample on the 13 old items (m6_prior/results/groups.csv)?
    oldg = pd.read_csv(EXP / 'm6_prior' / 'results' / 'groups.csv')
    L += ['', '## Post hoc (not pre-registered): LR for generations and traditions, COL for period (RULE_LR)', '',
          '| set | ' + ' | '.join(f'n&#772; = {n}' for n in nb) + ' |', sep]
    for label, sub in (('primary, RULE_LR / P0', g[g.primary]), ('secondary, RULE_LR / P0', g[~g.primary]),
                       ('13 old items (in-sample), RULE_LR / P0', oldg)):
        sub = sub.copy()
        sub['mse_RULE_LR'] = np.where(sub.kind == 'period', sub.mse_COL, sub.mse_LR)
        L.append(f'| {label} | ' + ' | '.join(f'{ratio(sub[sub.nbar == n], "RULE_LR", "P0"):.3f}' for n in nb) + ' |')
    (OUT / 'summary.md').write_text('\n'.join(L) + '\n')
    (OUT / 'mse_by_budget.svg').write_text(svg_lines(
        'Mean subgroup MSE relative to the difference estimator on 7 fresh GSS items',
        'Mean MSE ratio to the difference estimator against calibration respondents per group on the primary '
        'fresh items, for the zero prior, COL, ADD, the fixed by-kind rule and the known-bias oracle',
        'calibration respondents per group (log scale)', 'mean MSE / difference estimator\'s',
        [(a, nb, [ratio(p[p.nbar == n], a, 'D') for n in nb]) for a in ('P0', 'COL', 'ADD', 'RULE', 'oracle')],
        logx=True, hline=1.0))
    print('\n'.join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--check', action='store_true', help='also refit the 13 old items against cells.csv')
    ap.add_argument('--summary-only', action='store_true', help='re-summarise the saved results/*.csv')
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    if a.summary_only:
        line = next(x for x in (OUT / 'summary.md').read_text().splitlines() if x.startswith('Pipeline check'))
        summarise(pd.read_csv(OUT / 'groups.csv'), pd.read_csv(OUT / 'cells.csv'), line)
        return
    cells = stage1(a.jobs, a.check)
    check_line = 'Pipeline check not run (pass --check).'
    if a.check:
        old = pd.read_csv(EXP / 'm6_allocation' / 'results' / 'cells.csv')
        mg = old.merge(cells, on=['pair', 'item'], suffixes=('_old', '_new'))
        dmax = float((mg.bias_old - mg.bias_new).abs().max())
        check_line = (f'Pipeline check: refitting the 13 old items reproduces {len(mg)} of {len(old)} cells of '
                      f'm6_allocation/results/cells.csv; largest bias difference {100 * dmax:.4f} points; '
                      f'N equal in {(mg.N_old == mg.N_new).sum()}.')
        print(check_line, flush=True)
    fresh = cells[cells.item.isin(ALL_FRESH)].reset_index(drop=True)
    fresh.to_csv(OUT / 'cells.csv', index=False)
    g = stage2(fresh, a.jobs)
    g.to_csv(OUT / 'groups.csv', index=False)
    summarise(g, fresh, check_line)


if __name__ == '__main__':
    main()

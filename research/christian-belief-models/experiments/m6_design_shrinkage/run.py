#!/usr/bin/env python3
"""Milestone 6 (part): Sections 6 to 8 (shrinkage, intervals, prior means) under the GSS design,
scored against the population share.

    python3 experiments/m6_design_shrinkage/run.py [--jobs 4]     # stage A (microdata) + stage B
    python3 experiments/m6_design_shrinkage/run.py --score-only   # stage B from results/cells.csv

Sections 6 to 8 of the draft score the shrinkage estimator against the target's *sample* share with
Kish (weights-only) variances. Against the *population* share theta the survey's own error enters:

  D       = E0 + rbar_s                  D  - theta = eps_y + delta
  FH(m)   = E0 + m + gamma (D - E0 - m)  FH - theta = (1-g)(b - m) + (1-g) eps_f + g eps_y + g delta

where eps_y, eps_f are the phase-1 (design) errors of the full target sample's weighted share of y and
of the model's mean prediction f, delta the phase-2 error of the calibration subsample's residual mean
(variance v = sd^2 / n, simple random within the target as GSS ballots are), and b the transferred
model's bias (the sample-level one stands in for the population one). Both errors are normal in this
approximation, so MSE and every interval's coverage are closed form.

Stage A (microdata): the 228 cells of m6_allocation refitted exactly as there (the run checks every
bias against its cells.csv); per cell the ultimate-cluster variances V_y, V_f, V_r of the linearised
weighted means of y, f and y - f with GSS strata and PSUs (helpers from m6_design_variance).
Stage B (no microdata): every group x budget row of m6_prior/results/groups.csv.

Plan and predictions: LOG.md, 2026-11-17 (written before this ran).
Writes results/cells.csv, results/groups.csv, results/summary.md, results/coverage_by_budget.svg.
"""
import argparse
import importlib.util
import math
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = HERE / 'results'
sys.path.insert(0, str(ROOT / 'src'))
sys.path.insert(0, str(ROOT.parent / '_shared'))
from linefig import svg_lines  # noqa: E402


def _load(name, rel):
    sp = importlib.util.spec_from_file_location(name, ROOT / 'experiments' / rel / 'run.py')
    mod = importlib.util.module_from_spec(sp)
    sys.modules[name] = mod
    sp.loader.exec_module(mod)
    return mod


iv = _load('m6_iv', 'm6_intervals')
PRIORS = ('P0', 'COL', 'ADD', 'LR', 'RULE')
RULE = {'period': 'COL', 'generation': 'P0', 'tradition': 'ADD'}
NB = (50, 100, 200, 400)


# ---------- pure helpers (tested in test_design_shrinkage.py) ----------

def pop_error(b, m, sd, n, tau2, Vy, Vf, C, extra_v=0.0):
    """Mean and sd of FH(m) - theta, and gamma. extra_v is added to v in gamma only (a designer who
    knows phase 1 exists shrinks with v + V_y)."""
    v = sd ** 2 / n
    g = tau2 / (tau2 + v + extra_v)
    mu = (1 - g) * (b - m)
    var = (1 - g) ** 2 * Vf + g ** 2 * Vy + 2 * g * (1 - g) * C + g ** 2 * v
    return mu, math.sqrt(var), g, v


def row_stats(b, m, sd, n, tau2, Vy, Vf, C):
    """Per group: MSE against the population share of D, of FH (Kish gamma) and of FH with the
    design-aware gamma; exact coverage and half-width of the paper's robust EB interval (Kish v) and of
    the design-aware one (v + V_y in gamma, the critical value and the width); the sample-share MSE."""
    v = sd ** 2 / n
    out = {'mse_D_samp': v, 'mse_D_pop': v + Vy}
    g = tau2 / (tau2 + v)
    out['mse_samp'] = ((1 - g) * (b - m)) ** 2 + g ** 2 * v
    mu, s, g, _ = pop_error(b, m, sd, n, tau2, Vy, Vf, C)
    out['mse_pop'] = mu ** 2 + s ** 2
    h = iv.cva(v / tau2) * g * math.sqrt(v)
    out['hw_rob'], out['cov_rob_samp'] = h, float(iv.cover(h, (1 - g) * (b - m), g * math.sqrt(v)))
    out['cov_rob_pop'] = float(iv.cover(h, mu, s))
    vt = v + Vy
    mu2, s2, g2, _ = pop_error(b, m, sd, n, tau2, Vy, Vf, C, extra_v=Vy)
    out['mse_pop_des'] = mu2 ** 2 + s2 ** 2
    h2 = iv.cva(vt / tau2) * g2 * math.sqrt(vt)
    out['hw_rob_des'], out['cov_rob_des'] = h2, float(iv.cover(h2, mu2, s2))
    out['hw_D'] = iv.Z95 * math.sqrt(v)
    out['cov_D_pop'] = float(iv.cover(out['hw_D'], 0.0, math.sqrt(v + Vy)))
    out['cov_D_des'] = float(iv.cover(iv.Z95 * math.sqrt(vt), 0.0, math.sqrt(vt)))
    return out


def ratio(x, num, den):
    return x[num].mean() / x[den].mean()


def boot(x, num, den, reps=2000, seed=0):
    """Item-cluster bootstrap 95% interval of the mean-MSE ratio num/den."""
    rng = np.random.default_rng(seed)
    items = x.item.unique()
    by = {j: x[x.item == j] for j in items}
    r = [ratio(pd.concat([by[j] for j in rng.choice(items, len(items))]), num, den) for _ in range(reps)]
    return np.quantile(r, [.025, .975])


# ---------- stage A ----------

def fit_pair(args):
    name, kind, S, T, items, (psu_strat, n_h) = args
    dv = _load('m6_dv', 'm6_design_variance')
    sb, gss = dv.sb, dv.gss
    out = []
    for j in items:
        s, t = S[S[j].notna()], T[T[j].notna()]
        feats = [f for f in gss.features_for(j) if s[f].notna().sum() >= 2]
        if len(s) < sb.MIN_S or len(t) < sb.MIN_T or s[j].nunique() < 2 or t[j].nunique() < 2:
            continue
        mdl = sb.hgb(feats).fit(s[feats].values.astype(float), s[j].values, sample_weight=s.w.values)
        f = mdl.predict_proba(t[feats].values.astype(float))[:, 1]
        y, w, ps = t[j].values.astype(float), t.w.values.astype(float), t.psu.values

        def V(x):
            return dv.ultimate_cluster_var(dv.lin_mean(x, w), ps, psu_strat, n_h)
        out.append(dict(pair=name, kind=kind, item=j, N=len(t),
                        bias=float(np.average(f, weights=w) - np.average(y, weights=w)),
                        Vy=V(y), Vf=V(f), Vr=V(y - f), Vy_kish=dv.kish_var(y, w)))
        print(name, j, flush=True)
    return out


def stage_a(jobs_n):
    dv = _load('m6_dv', 'm6_design_variance')
    al = _load('m6_al', 'm6_allocation')
    d, design = dv.load()
    jobs = []
    for name, kind, sm, tm in dv.sb.pairs(d):
        if al.family_of(name, kind) is None:
            continue
        catholic_both = kind == 'generation' or name.startswith('Catholic <=')
        items = list(dv.gss.TARGETS) + (list(dv.gss.CATHOLIC_ONLY) if catholic_both else [])
        jobs.append((name, kind, d[sm], d[tm], items, design))
    with ProcessPoolExecutor(jobs_n) as ex:
        c = pd.DataFrame([r for rs in ex.map(fit_pair, jobs) for r in rs])
    c['C'] = (c.Vy + c.Vf - c.Vr) / 2
    c.to_csv(OUT / 'cells.csv', index=False)


# ---------- stage B ----------

def stage_b():
    c = pd.read_csv(OUT / 'cells.csv')
    ref = pd.read_csv(ROOT / 'experiments' / 'm6_allocation' / 'results' / 'cells.csv')
    chk = ref.merge(c, on=['pair', 'item'], suffixes=('_ref', ''), how='left')
    g = pd.read_csv(ROOT / 'experiments' / 'm6_prior' / 'results' / 'groups.csv')
    for a in ('m', 'tau2'):
        g[f'{a}_RULE'] = [g.at[i, f'{a}_' + RULE[k]] for i, k in zip(g.index, g.kind)]
    g = g.merge(c[['pair', 'item', 'Vy', 'Vf', 'Vr', 'C', 'Vy_kish']], on=['pair', 'item'], how='left',
                validate='many_to_one')
    rows = []
    for r in g.itertuples():
        base = dict(family=r.family, kind=r.kind, item=r.item, pair=r.pair, nbar=r.nbar, bias=r.bias,
                    sd=r.sd, Vy=r.Vy, Vf=r.Vf, C=r.C, mse_P0_prior_run=r.mse_P0)
        for a in PRIORS:
            st = row_stats(r.bias, getattr(r, f'm_{a}'), r.sd, r.nbar, getattr(r, f'tau2_{a}'), r.Vy, r.Vf, r.C)
            for k, val in st.items():
                if k.startswith(('mse_D', 'hw_D', 'cov_D')):
                    base[k] = val
                else:
                    base[f'{k}_{a}'] = val
        rows.append(base)
    out = pd.DataFrame(rows)
    out.to_csv(OUT / 'groups.csv', index=False)
    summarise(chk, c, out)


def pct(x):
    return f'{x:.1%}'


def summarise(chk, c, g):
    L = ['# Milestone 6 (part): Sections 6 to 8 under the GSS design, against the population share '
         '(generated by run.py)', '',
         f'{len(c)} cells (pair x item); {g[["pair", "item"]].drop_duplicates().shape[0]} groups in families, '
         f'{len(g)} group x budget rows. Ultimate-cluster (with-replacement PSU) variances with GSS strata and '
         'PSUs; 1972-74 rows are their own PSUs. Phase 2 simple random within the target.', '',
         '## Checks', '',
         f'- refit against m6_allocation: {chk.bias.notna().sum()} of {len(chk)} cells matched; largest |bias| '
         f'difference {100 * (chk.bias - chk.bias_ref).abs().max():.4f} points',
         f'- sample-share MSE of P0 recomputed here against m6_prior\'s: largest relative difference '
         f'{((g.mse_samp_P0 / g.mse_P0_prior_run) - 1).abs().max():.2e}', '']
    rf = c.Vf / c.Vy
    cor = c.C / np.sqrt(c.Vf * c.Vy)
    L += ['## Phase-1 errors of the full target sample', '',
          f'- median V_y: {c.Vy.median():.2e} (sd {100 * math.sqrt(c.Vy.median()):.2f} points); median deff of y '
          f'{(c.Vy / c.Vy_kish).median():.3f}',
          f'- median V_f / V_y: {rf.median():.3f} (quartiles {rf.quantile(.25):.3f}, {rf.quantile(.75):.3f})',
          f'- median correlation of eps_f and eps_y: {cor.median():.3f} (quartiles {cor.quantile(.25):.3f}, '
          f'{cor.quantile(.75):.3f})', '']
    head = '| | ' + ' | '.join(f'n&#772; = {n}' for n in NB) + ' |'
    sep = '|---|' + '---:|' * len(NB)

    def by_n(f):
        return ' | '.join(f(g[g.nbar == n]) for n in NB)
    L += ['## Section 6: shrinkage (P0 = FH_prior) mean MSE over D\'s, all groups', '', head, sep,
          '| sample share, Kish (as in the draft) | ' + by_n(lambda x: f'{ratio(x, "mse_samp_P0", "mse_D_samp"):.3f}') + ' |',
          '| population share, Kish gamma | ' + by_n(lambda x: f'{ratio(x, "mse_pop_P0", "mse_D_pop"):.3f}') + ' |',
          '| population share, design-aware gamma | ' + by_n(lambda x: f'{ratio(x, "mse_pop_des_P0", "mse_D_pop"):.3f}') + ' |',
          '', 'Item-cluster bootstrap 95%, population share, Kish gamma: ' + ', '.join(
              f'{n}: {boot(g[g.nbar == n], "mse_pop_P0", "mse_D_pop")[0]:.3f} to '
              f'{boot(g[g.nbar == n], "mse_pop_P0", "mse_D_pop")[1]:.3f}' for n in NB), '',
          '| share of D\'s population MSE that is V_y | ' + by_n(lambda x: f'{(x.Vy.sum() / x.mse_D_pop.sum()):.3f}') + ' |',
          '| share of P0\'s population MSE that is phase 1 | ' + by_n(
              lambda x: f'{1 - x.mse_samp_P0.sum() / x.mse_pop_P0.sum():.3f}') + ' |', '']
    fam = g.groupby(['family', 'item', 'nbar'])[['mse_samp_P0', 'mse_D_samp', 'mse_pop_P0', 'mse_D_pop']].mean()
    fr_s = (fam.mse_samp_P0 / fam.mse_D_samp).groupby('nbar').median()
    fr_p = (fam.mse_pop_P0 / fam.mse_D_pop).groupby('nbar').median()
    L += ['Median over the 73 families of the family-mean MSE ratio (the draft\'s Section 6 statistic, here '
          'analytic rather than simulated):', '', head, sep,
          '| sample share | ' + ' | '.join(f'{fr_s[n]:.3f}' for n in NB) + ' |',
          '| population share | ' + ' | '.join(f'{fr_p[n]:.3f}' for n in NB) + ' |', '']
    L += ['## Section 7: robust EB intervals for P0, coverage of the population share', '', head, sep,
          '| D, Kish interval | ' + by_n(lambda x: pct(x.cov_D_pop.mean())) + ' |',
          '| robust EB, Kish v, scored on the sample share (draft) | ' + by_n(lambda x: pct(x.cov_rob_samp_P0.mean())) + ' |',
          '| robust EB, Kish v, scored on the population share | ' + by_n(lambda x: pct(x.cov_rob_pop_P0.mean())) + ' |',
          '| robust EB, design-aware (v + V_y) | ' + by_n(lambda x: pct(x.cov_rob_des_P0.mean())) + ' |',
          '| 10th percentile, Kish v, population | ' + by_n(lambda x: pct(x.cov_rob_pop_P0.quantile(.1))) + ' |',
          '| 10th percentile, design-aware | ' + by_n(lambda x: pct(x.cov_rob_des_P0.quantile(.1))) + ' |',
          '| median half-width design-aware / Kish | ' + by_n(lambda x: f'{(x.hw_rob_des_P0 / x.hw_rob_P0).median():.3f}') + ' |',
          '| median half-width design-aware / D\'s | ' + by_n(lambda x: f'{(x.hw_rob_des_P0 / x.hw_D).median():.3f}') + ' |', '']
    L += ['By kind at n&#772; = 400, mean coverage of the population share (Kish v / design-aware):', '',
          '| kind | groups | Kish v | design-aware | V_y share of D\'s MSE |', '|---|---:|---:|---:|---:|']
    g400 = g[g.nbar == 400]
    for k, x in g400.groupby('kind'):
        L.append(f'| {k} | {len(x)} | {pct(x.cov_rob_pop_P0.mean())} | {pct(x.cov_rob_des_P0.mean())} | '
                 f'{x.Vy.sum() / x.mse_D_pop.sum():.3f} |')
    L += ['', '## Section 8: prior means, mean MSE over P0\'s', '',
          '| prior | target | ' + ' | '.join(f'n&#772; = {n}' for n in NB) + ' | period at 50 | generation at 50 | tradition at 50 |',
          '|---|---|' + '---:|' * (len(NB) + 3)]
    g50 = g[g.nbar == 50]
    for a in PRIORS[1:]:
        for tgt, col in (('sample', 'samp'), ('population', 'pop')):
            L.append(f'| {a} | {tgt} | ' + by_n(lambda x: f'{ratio(x, f"mse_{col}_{a}", f"mse_{col}_P0"):.3f}')
                     + ' | ' + ' | '.join(f'{ratio(g50[g50.kind == k], f"mse_{col}_{a}", f"mse_{col}_P0"):.3f}'
                                          for k in ('period', 'generation', 'tradition')) + ' |')
    lo, hi = boot(g50, 'mse_pop_RULE', 'mse_pop_P0')
    L += ['', f'RULE over P0, population share, n&#772; = 50: item-cluster bootstrap 95% {lo:.3f} to {hi:.3f}.',
          '', 'Robust EB coverage of the population share around each prior (Kish v / design-aware):', '',
          '| prior | ' + ' | '.join(f'n&#772; = {n}' for n in NB) + ' |', sep]
    for a in PRIORS:
        L.append(f'| {a} | ' + by_n(lambda x: f'{pct(x["cov_rob_pop_" + a].mean())} / {pct(x["cov_rob_des_" + a].mean())}') + ' |')
    g4 = g[g.nbar == 400]
    L += ['', '## Prediction checks (LOG.md, 2026-11-17)', '',
          f'1. median V_f/V_y 0.3 to 0.8: {rf.median():.3f}; median correlation at least 0.5: {cor.median():.3f}',
          f'2. P0/D population at 50 at most 0.55: {ratio(g50, "mse_pop_P0", "mse_D_pop"):.3f}, within 0.03 of the '
          f'sample-share {ratio(g50, "mse_samp_P0", "mse_D_samp"):.3f}; at 400 between the sample-share '
          f'{ratio(g4, "mse_samp_P0", "mse_D_samp"):.3f} and 0.95: {ratio(g4, "mse_pop_P0", "mse_D_pop"):.3f}',
          f'3. Kish robust EB, population: mean at 50 at least 94%: {pct(g50.cov_rob_pop_P0.mean())}; at 400 90 to '
          f'94.5%: {pct(g4.cov_rob_pop_P0.mean())}; 10th percentile at 400 below 90%: {pct(g4.cov_rob_pop_P0.quantile(.1))}',
          '4. design-aware mean at least 94.5% at every n&#772;: ' + ', '.join(
              pct(g[g.nbar == n].cov_rob_des_P0.mean()) for n in NB)
          + f'; median width ratio at 50 at most 1.03: {(g50.hw_rob_des_P0 / g50.hw_rob_P0).median():.3f}; at 400 at most '
          f'1.15: {(g4.hw_rob_des_P0 / g4.hw_rob_P0).median():.3f}',
          f'5. RULE/P0 population at 50 within 0.03 of {ratio(g50, "mse_samp_RULE", "mse_samp_P0"):.3f}: '
          f'{ratio(g50, "mse_pop_RULE", "mse_pop_P0"):.3f}; period COL/P0 at most 0.30: '
          f'{ratio(g50[g50.kind == "period"], "mse_pop_COL", "mse_pop_P0"):.3f}',
          f'Refutation (P0/D population at 50 above 0.60): {ratio(g50, "mse_pop_P0", "mse_D_pop"):.3f}']
    (OUT / 'summary.md').write_text('\n'.join(L) + '\n')
    (OUT / 'coverage_by_budget.svg').write_text(svg_lines(
        'Coverage of the population share by nominal 95% intervals for a shrunk subgroup share',
        'Mean coverage over subgroups against calibration respondents per group: the difference estimator, '
        'the robust empirical Bayes interval with the Kish variance and with the design-aware variance',
        'calibration respondents per group (log scale)', 'mean coverage of the population share',
        [('difference estimator, Kish', NB, [g[g.nbar == n].cov_D_pop.mean() for n in NB]),
         ('robust EB, Kish v', NB, [g[g.nbar == n].cov_rob_pop_P0.mean() for n in NB]),
         ('robust EB, design-aware v + V_y', NB, [g[g.nbar == n].cov_rob_des_P0.mean() for n in NB])],
        logx=True, hline=0.95))
    print('\n'.join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--score-only', action='store_true')
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    if not a.score_only:
        stage_a(a.jobs)
    stage_b()


if __name__ == '__main__':
    main()

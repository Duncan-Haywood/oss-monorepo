#!/usr/bin/env python3
"""Milestone 5, scale point: does a larger model of the same family know more of the gap between groups?

    python3 experiments/m5_local_llm/scale.py [--model Qwen2.5-3B-Instruct] [--boot 2000]

Needs results/scores_<model>.csv from score.py (same seed-0 sample as the 0.5B and 1.5B runs) and the
committed results/cells.csv. For each of the 74 cells of cells.csv it scores the new model exactly as
analyse.py scores the others (zero-shot, recalibrated on the source, and source share + predicted gap),
checks that the cell's n_t, n_s, theta_T and theta_S match the committed row, and compares the models'
predicted gaps with the true gaps. Plan and predictions: LOG.md, 2026-11-19 (written before this ran).
Writes results/scale_cells.csv, results/scale_summary.md and results/scale_slope.svg.
"""
import argparse
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import analyse as A  # noqa: E402

OUT = HERE / 'results'
# Parameter counts from the Qwen2.5 model cards (total, billions).
PARAMS = {'LLM05': 0.49, 'LLM15': 1.54, 'LLM3': 3.09}


def slope(true_gap, pred_gap):
    """Least-squares slope of predicted on true gap."""
    return float(np.polyfit(np.asarray(true_gap, float), np.asarray(pred_gap, float), 1)[0])


def boot_slope(true_gap, pred_gap, B, rng):
    t, p = np.asarray(true_gap, float), np.asarray(pred_gap, float)
    idx = rng.integers(0, len(t), (B, len(t)))
    bs = np.array([slope(t[i], p[i]) for i in idx])
    return slope(t, p), float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))


def loglinear(params, slopes):
    """Fit slope = a + b log2(params); return a, b and the size (billions) at which the line reaches 1."""
    b, a = np.polyfit(np.log2(params), slopes, 1)
    return float(a), float(b), float(2 ** ((1 - a) / b)) if b > 0 else float('inf')


def lg(p):
    """Logit with p clipped at 1e-6: score.py writes p to six decimals, so smaller values are not resolved."""
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def score_cells(key, model):
    full = A.gss.load()
    full = full[full.tradition.isin(A.sample.TRADS)].reset_index(drop=True)
    A.MODELS = {key: model}
    pool = A.load_scores(A.sample.draw(full))
    gfull = A.sample.groups(full)
    old = pd.read_csv(OUT / 'cells.csv')
    ref = old[old.estimator == 'SRC'].set_index(['pair', 'item'])
    rows, worst = [], 0.0
    for name, kind, gs, gt in A.sample.PAIRS:
        for j in sorted(set(ref.loc[name].index)) if name in ref.index.get_level_values(0) else []:
            S = full[gfull[gs].values & full[j].notna().values]
            s = pool[pool[f'in:{gs}'] & pool[j].notna()]
            t = pool[pool[f'in:{gt}'] & pool[j].notna()]
            y, w = t[j].values.astype(float), t.w.values.astype(float)
            theta_S = A.wmean(S[j].values, S.w.values)
            theta_T = A.wmean(y, w)
            r0 = ref.loc[(name, j)]
            assert (len(t), len(s)) == (r0.n_t, r0.n_s), (name, j)
            worst = max(worst, abs(theta_T - r0.theta_T), abs(theta_S - r0.theta_S))
            ft, fs = t[f'{key}:{j}'].values, s[f'{key}:{j}'].values
            gap = A.wmean(ft, w) - A.wmean(fs, s.w.values)
            preds = {key: ft, f'{key}_platt': A.platt(fs, s[j].values, s.w.values)(ft),
                     f'{key}_shift': float(np.clip(theta_S + gap, 0, 1)),
                     # exploratory (added after the pre-registered outcome): the gap applied on the logit scale
                     f'{key}_logitshift': float(1 / (1 + np.exp(-(lg(theta_S) + A.wmean(lg(ft), w)
                                                                   - A.wmean(lg(fs), s.w.values)))))}
            for k, f in preds.items():
                r = dict(pair=name, kind=kind, item=j, n_t=len(t), n_s=len(s), theta_T=theta_T,
                         theta_S=theta_S, estimator=k, **A.cell_metrics(y, f, w))
                if k == key:
                    r['pred_gap'] = gap
                    r['logit_gap'] = (A.wmean(lg(ft), w) - A.wmean(lg(fs), s.w.values))
                    r['true_logit_gap'] = float(lg(theta_T) - lg(theta_S))
                rows.append(r)
    c = pd.DataFrame(rows)
    c['abs_err'] = c.err.abs() * 100
    c['true_gap'] = c.theta_T - c.theta_S
    print(f'pipeline check: {c[["pair", "item"]].drop_duplicates().shape[0]} cells, largest share '
          f'difference from cells.csv {worst:.2e}')
    assert worst < 1e-9
    return pd.concat([old, c], ignore_index=True), worst


def svg(points, path):
    """Slope of predicted on true gap against model size (log2 axis), with 95% intervals."""
    W, H, l, r, t, b = 420, 260, 56, 16, 18, 44
    xs = [np.log2(p) for p, *_ in points]
    x0, x1, y0, y1 = min(xs) - 0.4, max(xs) + 0.4, -0.4, 1.1
    X = lambda v: l + (v - x0) / (x1 - x0) * (W - l - r)
    Y = lambda v: t + (y1 - v) / (y1 - y0) * (H - t - b)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="11">',
         '<rect width="100%" height="100%" fill="#fff"/>']
    for v in (-0.25, 0, 0.25, 0.5, 0.75, 1.0):
        col = '#333' if v in (0, 1) else '#ddd'
        dash = ' stroke-dasharray="4 3"' if v == 1 else ''
        o.append(f'<line x1="{l}" x2="{W - r}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{col}"{dash}/>')
        o.append(f'<text x="{l - 6}" y="{Y(v) + 4:.1f}" text-anchor="end">{v:g}</text>')
    o.append(f'<text x="{W - r}" y="{Y(1) - 4:.1f}" text-anchor="end" fill="#333">slope 1: knows the whole gap</text>')
    for p, s, lo, hi, lab in points:
        x = X(np.log2(p))
        o.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{Y(lo):.1f}" y2="{Y(hi):.1f}" stroke="#0072B2" stroke-width="2"/>')
        o.append(f'<circle cx="{x:.1f}" cy="{Y(s):.1f}" r="4" fill="#0072B2"/>')
        o.append(f'<text x="{x:.1f}" y="{H - b + 16}" text-anchor="middle">{lab}</text>')
        o.append(f'<text x="{x + 7:.1f}" y="{Y(s) + 4:.1f}">{s:.2f}</text>')
    o.append(f'<text x="{(l + W - r) / 2}" y="{H - 6}" text-anchor="middle">Qwen2.5-Instruct model size (log scale)</text>')
    o.append(f'<text transform="translate(14 {(t + H - b) / 2}) rotate(-90)" text-anchor="middle">'
             'slope of predicted on true gap</text></svg>')
    path.write_text('\n'.join(o) + '\n')


def summarise(c, key, model, boot):
    rng = np.random.default_rng(0)
    W = c.pivot(index=['pair', 'item'], columns='estimator', values=['auc', 'abs_err', 'var_ratio'])
    kinds = c.drop_duplicates(['pair', 'item']).set_index(['pair', 'item']).kind.reindex(W.index)
    L = [f'# Milestone 5, scale point: {model} against the 0.5B and 1.5B models\n',
         f'{len(W)} cells, same seed-0 sample and cells as `summary.md`; medians over cells, cell bootstrap 95% '
         f'intervals ({boot} draws). Level error in points.\n',
         '| Estimator | median AUC | median abs. level error | median var ratio |', '|---|---:|---:|---:|']
    est = ['LLM05', 'LLM15', key, 'LLM15_platt', f'{key}_platt', 'GBM_demog', 'GBM_full', 'SRC',
           'LLM05_shift', 'LLM15_shift', f'{key}_shift']
    for e in est:
        a = A.boot_median(W['auc'][e], boot, rng) if W['auc'][e].notna().any() else None
        b = A.boot_median(W['abs_err'][e], boot, rng)
        v = A.boot_median(W['var_ratio'][e], boot, rng)
        fa = f'{a[0]:.3f} ({a[1]:.3f}&ndash;{a[2]:.3f})' if a else '&mdash;'
        L.append(f'| {e} | {fa} | {b[0]:.2f} ({b[1]:.2f}&ndash;{b[2]:.2f}) | {v[0]:.3f} ({v[1]:.3f}&ndash;{v[2]:.3f}) |')
    L += ['', '## Paired differences (median over cells, 95% interval)', '']
    for m, x, z in [('auc', 'GBM_demog', key), ('auc', key, 'LLM15'), ('abs_err', key, 'LLM15'),
                    ('abs_err', f'{key}_shift', 'SRC'), ('abs_err', f'{key}_shift', 'GBM_full'),
                    ('abs_err', f'{key}_shift', 'LLM15_shift'), ('abs_err', f'{key}_platt', 'SRC')]:
        r = A.boot_median(W[m][x], boot, rng, paired=W[m][z])
        L.append(f'- {m}: {x} &minus; {z}: {r[0]:+.3f} ({r[1]:+.3f} to {r[2]:+.3f}), {r[3]} cells')
    L += ['', '## The gap between groups, by model size', '',
          '| Model | params (B) | Spearman (p) | slope (95% CI) | median abs. predicted gap | median abs. true gap |',
          '|---|---:|---:|---:|---:|---:|']
    pts = []
    for k in ('LLM05', 'LLM15', key):
        g = c[c.estimator == k]
        rho, p = spearmanr(g.pred_gap, g.true_gap)
        s, lo, hi = boot_slope(g.true_gap, g.pred_gap, boot, rng)
        pts.append((PARAMS[k], s, lo, hi, {'LLM05': '0.5B', 'LLM15': '1.5B'}.get(k, '3B')))
        L.append(f'| {k} | {PARAMS[k]:.2f} | {rho:.3f} ({p:.2g}) | {s:.2f} ({lo:.2f} to {hi:.2f}) | '
                 f'{g.pred_gap.abs().median() * 100:.2f} | {g.true_gap.abs().median() * 100:.2f} |')
    a, b, n1 = loglinear([q[0] for q in pts[1:]], [q[1] for q in pts[1:]])
    a3, b3, n13 = loglinear([q[0] for q in pts], [q[1] for q in pts])
    L += ['', f'Log-linear extrapolation of the slope (slope = a + b log2 size): through 1.5B and 3B, '
          f'b = {b:+.3f} per doubling, ' + (f'slope 1 at about {n1:,.0f}B parameters' if np.isfinite(n1) else
          'so the line never reaches slope 1') + '; through all three, '
          f'b = {b3:+.3f}, slope 1 at about {n13:,.0f}B. An extrapolation over a factor of six in size, '
          'not a forecast.']
    g = c[c.estimator == key]
    rho, p = spearmanr(g.logit_gap, g.true_logit_gap)
    sl, lo, hi = boot_slope(g.true_logit_gap, g.logit_gap, boot, rng)
    sc = pd.read_csv(OUT / f'scores_{model}.csv').p
    sat, zero = float(((sc < 0.01) | (sc > 0.99)).mean()), float((sc == 0).mean())
    L += ['', f'## Exploratory (not pre-registered): the {key} gap on the logit scale', '',
          f'{model} answers No to almost everything ({sat:.1%} of its {len(sc):,} scores are below 0.01 or above 0.99; '
          f'{zero:.1%} round to 0 at six decimals), '
          'so its probability-scale group means sit near 0 and their difference cannot carry a gap of any size. '
          'On the logit scale (weighted mean logit of p in the target minus the source, p clipped at 1e-6, '
          'the CSV\'s resolution) against logit(theta_T) - logit(theta_S):', '',
          f'- Spearman {rho:.3f} (p = {p:.2g}); slope {sl:.2f} ({lo:.2f} to {hi:.2f}); median |predicted logit gap| '
          f'{g.logit_gap.abs().median():.2f}, median |true logit gap| {g.true_logit_gap.abs().median():.2f}; '
          f'{len(g)} cells.']
    ex = f'{key}_logitshift'
    b = A.boot_median(W['abs_err'][ex], boot, rng)
    L.append(f'- {ex} = expit(logit theta_S + predicted logit gap): median abs. level error {b[0]:.2f} '
             f'({b[1]:.2f}&ndash;{b[2]:.2f}), mean {W["abs_err"][ex].mean():.2f}')
    for z in ('SRC', 'GBM_full', 'LLM15_shift'):
        r = A.boot_median(W['abs_err'][ex], boot, rng, paired=W['abs_err'][z])
        L.append(f'- abs_err: {ex} &minus; {z}: {r[0]:+.3f} ({r[1]:+.3f} to {r[2]:+.3f}), {r[3]} cells')
    L += ['', '| Kind | cells | SRC | GBM_full | ' + ex + ' | logit-gap slope | Spearman |', '|---|---:|---:|---:|---:|---:|---:|']
    for kd in ['generation', 'ethnicity', 'tradition', 'period']:
        sel = (kinds == kd).values
        gk = g[g.kind == kd]
        L.append(f'| {kd} | {sel.sum()} | ' + ' | '.join(f'{W["abs_err"][e][sel].median():.2f}' for e in ('SRC', 'GBM_full', ex)) +
                 f' | {slope(gk.true_logit_gap, gk.logit_gap):.2f} | {spearmanr(gk.logit_gap, gk.true_logit_gap)[0]:.2f} |')
    L += ['', '| Item | cells | SRC | GBM_full | ' + ex + ' | share of scores &lt; 1e-5 |', '|---|---:|---:|---:|---:|---:|']
    scr = pd.read_csv(OUT / f'scores_{model}.csv')
    items = W.index.get_level_values('item')
    for j in dict.fromkeys(items):
        sel = items == j
        L.append(f'| {j} | {sel.sum()} | ' + ' | '.join(f'{W["abs_err"][e][sel].median():.2f}' for e in ('SRC', 'GBM_full', ex)) +
                 f' | {(scr[scr.item == j].p < 1e-5).mean():.2f} |')
    L += ['', '## By kind of transfer (median abs. level error, points)', '',
          '| Kind | cells | SRC | GBM_full | LLM15_shift | ' + f'{key}_shift | slope LLM15 | slope {key} |',
          '|---|---:|---:|---:|---:|---:|---:|---:|']
    for kd in ['generation', 'ethnicity', 'tradition', 'period']:
        sel = (kinds == kd).values
        gk = lambda k: c[(c.estimator == k) & (c.kind == kd)]
        L.append(f'| {kd} | {sel.sum()} | ' + ' | '.join(f'{W["abs_err"][e][sel].median():.2f}' for e in
                 ('SRC', 'GBM_full', 'LLM15_shift', f'{key}_shift')) +
                 f' | {slope(gk("LLM15").true_gap, gk("LLM15").pred_gap):.2f} | '
                 f'{slope(gk(key).true_gap, gk(key).pred_gap):.2f} |')
    (OUT / 'scale_summary.md').write_text('\n'.join(L) + '\n')
    svg(pts, OUT / 'scale_slope.svg')
    print('\n'.join(L))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='Qwen2.5-3B-Instruct')
    ap.add_argument('--key', default='LLM3')
    ap.add_argument('--boot', type=int, default=2000)
    a = ap.parse_args()
    c, _ = score_cells(a.key, a.model)
    c[c.estimator.str.startswith(a.key)].to_csv(OUT / 'scale_cells.csv', index=False)
    summarise(c, a.key, a.model, a.boot)

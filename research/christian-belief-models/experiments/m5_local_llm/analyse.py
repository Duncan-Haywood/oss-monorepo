#!/usr/bin/env python3
"""Milestone 5, stage 2: compare the local LLMs with the transferred tabular models, cell by cell.

    python3 experiments/m5_local_llm/analyse.py [--boot 2000]

Needs results/scores_Qwen2.5-0.5B-Instruct.csv and results/scores_Qwen2.5-1.5B-Instruct.csv from
score.py. Plan and predictions: LOG.md, 2026-11-17, milestone 5 (written before this ran).
Writes results/cells.csv (pair x item x estimator) and results/summary.md.
"""
import argparse
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'src'))
sys.path.insert(0, str(HERE))
import gss  # noqa: E402
import sample  # noqa: E402

_sp = importlib.util.spec_from_file_location('m6_shift', ROOT / 'experiments' / 'm6_shift_bound' / 'run.py')
sb = importlib.util.module_from_spec(_sp)
sys.modules['m6_shift'] = sb
_sp.loader.exec_module(sb)

OUT = HERE / 'results'
MODELS = {'LLM05': 'Qwen2.5-0.5B-Instruct', 'LLM15': 'Qwen2.5-1.5B-Instruct'}
ITEMS = [j for j in gss.TARGETS if j != 'ever_divorced']
MIN_N = 60
CATHOLIC_PAIRS = ('generation', 'ethnicity')


# ---------- pure helpers (tested in test_local_llm.py) ----------

def wmean(x, w):
    return float(np.sum(w * x) / np.sum(w))


def wvar(x, w):
    m = wmean(x, w)
    return float(np.sum(w * (x - m) ** 2) / np.sum(w))


def platt(p_src, y_src, w_src):
    """Weighted logistic recalibration on the logit of p, fitted on the source; returns a function."""
    z = sb.logit(np.asarray(p_src))[:, None]
    m = LogisticRegression(C=1e6).fit(z, y_src, sample_weight=w_src)
    return lambda p: m.predict_proba(sb.logit(np.asarray(p))[:, None])[:, 1]


def cell_metrics(y, f, w):
    """Weighted AUC (nan for a constant f), level error wmean(f) - wmean(y), var(y - f)/var(y)."""
    f = np.broadcast_to(np.asarray(f, float), y.shape)
    auc = roc_auc_score(y, f, sample_weight=w) if np.ptp(f) > 0 else np.nan
    return dict(auc=auc, err=wmean(f, w) - wmean(y, w), var_ratio=wvar(y - f, w) / wvar(y, w))


def boot_median(x, B, rng, paired=None):
    """Median of x (or of x - paired) with a percentile cell bootstrap 95% interval."""
    v = np.asarray(x, float) - (0 if paired is None else np.asarray(paired, float))
    v = v[~np.isnan(v)]
    bs = np.median(v[rng.integers(0, len(v), (B, len(v)))], axis=1)
    return float(np.median(v)), float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5)), len(v)


# ---------- the experiment ----------

def load_scores(d):
    out = d
    for k, m in MODELS.items():
        s = pd.read_csv(OUT / f'scores_{m}.csv').pivot_table(index=['year', 'id'], columns='item', values='p')
        s.columns = [f'{k}:{c}' for c in s.columns]
        out = out.merge(s, left_on=['year', 'id'], right_index=True, how='left')
    return out


def run(boot=2000):
    full = gss.load()
    full = full[full.tradition.isin(sample.TRADS)].reset_index(drop=True)
    pool = load_scores(sample.draw(full))
    gfull = sample.groups(full)
    rows = []
    for name, kind, gs, gt in sample.PAIRS:
        catholic = kind in CATHOLIC_PAIRS or name.startswith('Catholic <=')
        for j in ITEMS + (list(gss.CATHOLIC_ONLY) if catholic else []):
            S = full[gfull[gs].values & full[j].notna().values]
            s = pool[pool[f'in:{gs}'] & pool[j].notna()]
            t = pool[pool[f'in:{gt}'] & pool[j].notna()]
            if len(s) < MIN_N or len(t) < MIN_N or t[j].nunique() < 2 or s[j].nunique() < 2 or len(S) < sb.MIN_S:
                continue
            y, w = t[j].values.astype(float), t.w.values.astype(float)
            theta_S = wmean(S[j].values, S.w.values)
            preds = {}
            for k in MODELS:
                preds[k] = t[f'{k}:{j}'].values
            cal = platt(s[f'LLM15:{j}'].values, s[j].values, s.w.values)
            preds['LLM15_platt'] = cal(t['LLM15:' + j].values)
            for k, feats in (('GBM_demog', [c for c in gss.DEMOG if c != 'marital' or j != 'ever_divorced']),
                             ('GBM_full', gss.features_for(j))):
                feats = [c for c in feats if S[c].notna().sum() >= 2]
                m = sb.hgb(feats).fit(S[feats].values.astype(float), S[j].values, sample_weight=S.w.values)
                preds[k] = m.predict_proba(t[feats].values.astype(float))[:, 1]
            preds['SRC'] = theta_S
            for k in MODELS:
                gap = wmean(t[f'{k}:{j}'].values, w) - wmean(s[f'{k}:{j}'].values, s.w.values)
                preds[f'{k}_shift'] = float(np.clip(theta_S + gap, 0, 1))
            theta_t = wmean(y, w)
            for k, f in preds.items():
                r = dict(pair=name, kind=kind, item=j, n_t=len(t), n_s=len(s), theta_T=theta_t,
                         theta_S=theta_S, estimator=k, **cell_metrics(y, f, w))
                if k in MODELS:
                    r['pred_gap'] = wmean(t[f'{k}:{j}'].values, w) - wmean(s[f'{k}:{j}'].values, s.w.values)
                rows.append(r)
            print(name, j, len(t), flush=True)
    c = pd.DataFrame(rows)
    c['abs_err'] = c.err.abs() * 100
    c['true_gap'] = c.theta_T - c.theta_S
    OUT.mkdir(exist_ok=True)
    c.to_csv(OUT / 'cells.csv', index=False)
    summarise(c, boot)


def summarise(c, boot):
    rng = np.random.default_rng(0)
    W = c.pivot(index=['pair', 'item'], columns='estimator', values=['auc', 'abs_err', 'var_ratio'])
    kinds = c.drop_duplicates(['pair', 'item']).set_index(['pair', 'item']).kind.reindex(W.index)
    est = ['LLM05', 'LLM15', 'LLM15_platt', 'GBM_demog', 'GBM_full', 'SRC', 'LLM05_shift', 'LLM15_shift']
    L = [f'# Milestone 5: local open-weights LLMs against the transferred models\n',
         f'{len(W)} cells (pair x item), {c.pair.nunique()} pairs; medians over cells, cell bootstrap 95% '
         f'intervals ({boot} draws). Level error in points; var ratio = var(y - f)/var(y) (Section 5).\n',
         '| Estimator | median AUC | median abs. level error | mean abs. level error | median var ratio |',
         '|---|---:|---:|---:|---:|']
    for e in est:
        a = boot_median(W['auc'][e], boot, rng) if W['auc'][e].notna().any() else None
        b = boot_median(W['abs_err'][e], boot, rng)
        v = boot_median(W['var_ratio'][e], boot, rng)
        fa = f'{a[0]:.3f} ({a[1]:.3f}&ndash;{a[2]:.3f})' if a else '&mdash;'
        L.append(f'| {e} | {fa} | {b[0]:.2f} ({b[1]:.2f}&ndash;{b[2]:.2f}) | {W["abs_err"][e].mean():.2f} | '
                 f'{v[0]:.3f} ({v[1]:.3f}&ndash;{v[2]:.3f}) |')
    L += ['', '## Paired differences (median over cells, 95% interval)', '']
    for m, x, z in [('auc', 'GBM_demog', 'LLM15'), ('auc', 'GBM_full', 'LLM15'), ('auc', 'LLM15', 'LLM05'),
                    ('abs_err', 'LLM15', 'GBM_full'), ('abs_err', 'LLM15_platt', 'SRC'),
                    ('abs_err', 'LLM15_platt', 'GBM_full'), ('abs_err', 'LLM15_shift', 'GBM_full'),
                    ('abs_err', 'LLM15_shift', 'SRC'), ('abs_err', 'LLM05_shift', 'GBM_full'),
                    ('abs_err', 'GBM_full', 'SRC')]:
        r = boot_median(W[m][x], boot, rng, paired=W[m][z])
        L.append(f'- {m}: {x} &minus; {z}: {r[0]:+.3f} ({r[1]:+.3f} to {r[2]:+.3f}), {r[3]} cells')
    L += ['', '## The shift: does the LLM know the gap between the groups?', '']
    for k in MODELS:
        g = c[c.estimator == k]
        rho, p = spearmanr(g.pred_gap, g.true_gap)
        sl = np.polyfit(g.true_gap, g.pred_gap, 1)[0]
        L.append(f'- {k}: Spearman(predicted gap, true gap) = {rho:.3f} (p = {p:.2g}), {len(g)} cells; '
                 f'slope of predicted on true gap {sl:.2f}; median |true gap| {g.true_gap.abs().median() * 100:.2f} '
                 f'points, median |predicted gap| {g.pred_gap.abs().median() * 100:.2f}')
    L += ['', '## By kind of transfer (median abs. level error, points; median AUC)', '',
          '| Kind | cells | ' + ' | '.join(est) + ' | AUC LLM15 | AUC GBM_demog | AUC GBM_full |',
          '|---|---:|' + '---:|' * (len(est) + 3)]
    for kd in ['generation', 'ethnicity', 'tradition', 'period']:
        sel = (kinds == kd).values
        if not sel.any():
            continue
        L.append(f'| {kd} | {sel.sum()} | ' + ' | '.join(f'{W["abs_err"][e][sel].median():.2f}' for e in est) +
                 ''.join(f' | {W["auc"][e][sel].median():.3f}' for e in ('LLM15', 'GBM_demog', 'GBM_full')) + ' |')
    L += ['', '## By item (median over pairs)', '',
          '| Item | cells | AUC LLM15 | AUC GBM_full | abs err LLM15 | abs err GBM_full | abs err LLM15_shift |',
          '|---|---:|---:|---:|---:|---:|---:|']
    items = W.index.get_level_values('item')
    for j in dict.fromkeys(items):
        sel = (items == j)
        L.append(f'| {j} | {sel.sum()} | {W["auc"]["LLM15"][sel].median():.3f} | {W["auc"]["GBM_full"][sel].median():.3f} | '
                 f'{W["abs_err"]["LLM15"][sel].median():.2f} | {W["abs_err"]["GBM_full"][sel].median():.2f} | '
                 f'{W["abs_err"]["LLM15_shift"][sel].median():.2f} |')
    (OUT / 'summary.md').write_text('\n'.join(L) + '\n')
    print('\n'.join(L))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--boot', type=int, default=2000)
    ap.add_argument('--summarise', action='store_true', help='redo summary.md from results/cells.csv')
    a = ap.parse_args()
    if a.summarise:
        summarise(pd.read_csv(OUT / 'cells.csv'), a.boot)
    else:
        run(a.boot)

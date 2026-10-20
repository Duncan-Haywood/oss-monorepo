"""Run the flexible-model benchmark for one lens and write flexible_models/results/<lens>.json.

  python3 run_lens.py <lens> [--stages main,null,lc,fc,oot] [--repeats N] [--quick]

Stages
  main  every model family on the lens's own outer folds (nested tuning), held-out gain with a
        paired cluster bootstrap 95% CI of the difference from the baseline GLM, training-fold
        gain (overfitting gap), calibration (O/E, slope), decile lift, C-index or AUC; on the first
        repeat also LightGBM permutation importance and mean |SHAP|, and the EBM's pairwise terms
  null  permuted-label control: outcomes shuffled within each training fold (flexible models
        should then not beat a constant on the real test outcomes)
  lc    learning curve: 10..100% of each training fold's people (baseline vs tuned LightGBM)
  fc    feature-count curve: top-k features by the training fold's LightGBM gain ranking
  oot   out-of-time split, where the lens defines one

Person-level predictions are cached under $FLEX_CACHE (default: the session scratch folder,
never the repository). Results are aggregates only.
"""
from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import flex  # noqa: E402

RESULTS = HERE.parent / 'results'
CACHE = Path(os.environ.get('FLEX_CACHE', '/tmp/flex_cache'))
if HERE.parents[3] in CACHE.resolve().parents:
    raise SystemExit('FLEX_CACHE must be outside the repository')


def jsonable(o):
    if isinstance(o, dict):
        return {str(k): jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [jsonable(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else round(float(o), 6)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.ndarray):
        return jsonable(o.tolist())
    return o


def save(lens, key, value):
    RESULTS.mkdir(exist_ok=True)
    p = RESULTS / f'{lens}.json'
    d = json.loads(p.read_text()) if p.exists() else {}
    d[key] = jsonable(value)
    p.write_text(json.dumps(d, indent=1))


# ----------------------------------------------------------------------------- discrimination
def disc_table(L, preds, models, ref='baseline', reps=200):
    """C-index on people (lens risk score) or weighted AUC on rows; mean over repeats, and a paired
    cluster-bootstrap 95% CI of the difference from `ref` on the repeat-averaged scores."""
    rng = np.random.default_rng(flex.SEED + 7)
    out = {}
    if L.score_fn is not None:
        T, D, W = L.people['T'].to_numpy(float), L.people['D'].to_numpy(float), L.people['W'].to_numpy(float)
        gp = L.people['group'].to_numpy()
        codes, uniq = pd.factorize(pd.Series(gp))
        per = {k: [flex.harrell_c(T, D, P['__scores__'][k], W) for P in preds] for k in models}
        avg = {k: np.mean([P['__scores__'][k] for P in preds], axis=0) for k in models}
        boots = {k: [] for k in models}
        for _ in range(reps):
            cnt = np.bincount(rng.integers(0, len(uniq), len(uniq)), minlength=len(uniq))[codes]
            for k in models:
                boots[k].append(flex.harrell_c(T, D, avg[k], W * cnt))
        label = L.score_label or "Harrell's C"
    else:
        codes, uniq = pd.factorize(pd.Series(L.group))
        per = {k: [flex.wauc(P[k], L.y, L.w) for P in preds] for k in models}
        avg = {k: np.mean([flex.link(L.family, P[k]) for P in preds], axis=0) for k in models}
        boots = {k: [] for k in models}
        for _ in range(reps):
            cnt = np.bincount(rng.integers(0, len(uniq), len(uniq)), minlength=len(uniq))[codes]
            for k in models:
                boots[k].append(flex.wauc(avg[k], L.y, L.w * cnt))
        label = 'AUC (rows)'
    for k in models:
        b, r = np.array(boots[k]), np.array(boots[ref])
        out[k] = dict(metric=label, value=float(np.mean(per[k])), ci=[float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))],
                      diff_vs_baseline=float(np.mean(per[k]) - np.mean(per[ref])),
                      diff_ci=[float(np.percentile(b - r, 2.5)), float(np.percentile(b - r, 97.5))])
    return out


# ----------------------------------------------------------------------------- importance hook
def make_hook(store, max_rows=60000):
    def hook(L, r, f, tr, te, fitted):
        if f != 0:
            return
        rng = np.random.default_rng(flex.SEED + 11)
        te_s = te if len(te) <= max_rows else np.sort(rng.choice(te, max_rows, replace=False))
        e = None if L.e is None else L.e[te_s]
        res = {}
        for k in ('lightgbm_tuned', 'baseline'):
            if k not in fitted:
                continue
            m = fitted[k]
            base = flex.row_loss(L.family, L.y[te_s], m.predict(L, te_s), L.w[te_s], e).sum()
            imp = {}
            for c in L.features:
                df = L.df.iloc[te_s].copy()
                df[c] = df[c].to_numpy()[rng.permutation(len(df))]
                loss = flex.row_loss(L.family, L.y[te_s], m.predict(L, df=df), L.w[te_s], e).sum()
                imp[c] = 100 * (loss - base) / base   # % increase in held-out loss when shuffled
            res[k] = dict(sorted(imp.items(), key=lambda kv: -kv[1]))
        store['permutation_importance_fold0'] = res
        if 'lightgbm_tuned' in fitted:
            m = fitted['lightgbm_tuned']
            X = m.tf.transform(L.df.iloc[te_s[:20000]])
            sh = m.booster.predict(X, pred_contrib=True)
            mabs = np.abs(sh[:, :-1]).mean(0)
            store['lightgbm_mean_abs_shap_fold0'] = dict(sorted(zip(m.tf.num + m.tf.cat, mabs.tolist()), key=lambda kv: -kv[1]))
        if 'ebm' in fitted:
            ebm = fitted['ebm'].m
            imps = ebm.term_importances()
            terms = [(n, float(v)) for n, v in zip(ebm.term_names_, imps)]
            store['ebm_terms_fold0'] = sorted(terms, key=lambda kv: -kv[1])
            store['ebm_pairs_fold0'] = sorted([t for t in terms if ' & ' in t[0]], key=lambda kv: -kv[1])
    return hook


# ----------------------------------------------------------------------------- stages
def stage_main(L, args):
    t0 = time.time()
    store = {}
    opts = dict(threads=args.threads, lgb_configs=args.lgb_configs, hgb_configs=args.hgb_configs, trees=args.trees,
                ebm_bags=args.ebm_bags, ebm_max_rows=args.ebm_max_rows, hook=make_hook(store))
    models = [m for m in args.models.split(',')]
    models = [m for m in models if m != 'lens_models'] + (list(L.lens_models) if 'lens_models' in models else [])
    bench = flex.benchmark(L, models=models, repeats=args.repeats, opts=opts)
    CACHE.mkdir(parents=True, exist_ok=True)
    pd.to_pickle(bench, CACHE / f'{L.name}_main.pkl')
    mk = flex.eval_mask(L)
    V = flex.restrict(L, mk)
    pv = [{k: (v if k == '__scores__' else v[mk]) for k, v in P.items()} for P in bench['preds']]
    rows = flex.summarise(V, dict(bench, preds=pv), boot=args.boot)
    disc = disc_table(V, pv, [m for m in models], reps=args.disc_boot)
    for r in rows:
        r['discrimination'] = disc[r['model']]
    save(L.name, 'main', dict(rows=rows, info=bench['info'], times=bench['times'], repeats=len(bench['preds']),
                              minutes=(time.time() - t0) / 60, **store))
    print(pd.DataFrame([{k: r[k] for k in ('model', 'heldout_gain', 'diff_vs_baseline', 'diff_vs_baseline_ci', 'train_gain',
                                          'calibration_slope', 'observed_expected')} | {'disc': r['discrimination']['value']}
                        for r in rows]).round(3).to_string(index=False), flush=True)


def permuted(L, seed):
    """Copy of the lens with outcomes shuffled among rows within each fold of repeat 0 (same
    exposure, weights and folds); the lens's outcome column in `df` is shuffled the same way."""
    import copy
    L2 = copy.copy(L)
    rng = np.random.default_rng(seed)
    y = L.y.copy()
    fold = L.folds[0]
    for f in flex.eval_folds(L, fold):
        ix = np.flatnonzero(fold == f)
        y[ix] = y[ix][rng.permutation(len(ix))]
    L2.y = y
    L2.df = L.df.copy()
    L2.df[L.ycol] = y
    return L2


def stage_null(L, args):
    """Train on shuffled outcomes, score on the real held-out outcomes."""
    L2 = permuted(L, flex.SEED + 99)
    fold = L.folds[0]
    models = ['baseline', 'lightgbm_tuned', 'enet_spline_pairwise']
    P = {k: np.zeros(len(L.y)) for k in ['constant'] + models}
    for f in flex.eval_folds(L, fold):
        tr, te = np.flatnonzero((fold != f) & (fold >= 0)), np.flatnonzero(fold == f)
        out, _, _, _, _ = flex.run_fold(L2, tr, te, models, flex.SEED + 500 + int(f),
                                        dict(threads=args.threads, lgb_configs=max(4, args.lgb_configs // 2), train_preds=False))
        for k in ['constant'] + models:
            P[k][te] = out[k]
    m = flex.eval_mask(L)
    V = flex.restrict(L, m)
    res = {k: flex.gain(L.family, V.y, P[k][m], P['constant'][m], V.w, V.e) for k in models}
    save(L.name, 'null_permuted_labels', dict(heldout_gain=res,
                                              note='outcomes shuffled within each fold of repeat 0; gains are on the REAL held-out outcomes'))
    print('null', res, flush=True)


def stage_lc(L, args):
    fold = L.folds[0]
    fracs = [0.1, 0.25, 0.5, 0.75, 1.0]
    out = []
    P = {(fr, k): np.zeros(len(L.y)) for fr in fracs for k in ('constant', 'baseline', 'lightgbm_tuned')}
    for f in flex.eval_folds(L, fold):
        tr_all, te = np.flatnonzero((fold != f) & (fold >= 0)), np.flatnonzero(fold == f)
        groups = np.unique(L.group[tr_all])
        rng = np.random.default_rng(flex.SEED + 300 + int(f))
        order = rng.permutation(groups)
        for fr in fracs:
            keep = order[:max(10, int(round(fr * len(groups))))]
            tr = tr_all[np.isin(L.group[tr_all], keep)]
            P[(fr, 'constant')][te] = flex.Constant().fit(L, tr).predict(L, te)
            try:
                P[(fr, 'baseline')][te] = flex.Baseline().fit(L, tr).predict(L, te)
            except Exception as ex:  # a tiny training set can break a lens's fixed pipeline
                print('baseline failed', fr, ex)
                P[(fr, 'baseline')][te] = P[(fr, 'constant')][te]
            P[(fr, 'lightgbm_tuned')][te] = flex.LGBM(n_configs=args.lc_configs, threads=args.threads).fit(L, tr, seed=flex.SEED + int(f)).predict(L, te)
            print(f'  lc fold {f} frac {fr}: {len(tr)} rows', flush=True)
    # gains are against the FULL-data constant so curves share one denominator
    m = flex.eval_mask(L)
    V = flex.restrict(L, m)
    full_const = P[(1.0, 'constant')][m]
    ntr = len(np.unique(L.group[(L.folds[0] >= 0) & ~m])) if getattr(L, 'eval_folds', None) else None
    for fr in fracs:
        for k in ('baseline', 'lightgbm_tuned'):
            out.append(dict(fraction=fr, model=k, heldout_gain=flex.gain(L.family, V.y, P[(fr, k)][m], full_const, V.w, V.e)))
    save(L.name, 'learning_curve', out)
    print(pd.DataFrame(out).pivot(index='fraction', columns='model', values='heldout_gain').round(3), flush=True)


def stage_fc(L, args):
    p = RESULTS / f'{L.name}.json'
    info = json.loads(p.read_text())['main']['info']
    fold = L.folds[0]
    nfeat = len([c for c in L.features if c != L.dur])
    ks = sorted({k for k in (1, 2, 4, 8, 16, 32) if k < nfeat} | {nfeat})
    P = {(k, m): np.zeros(len(L.y)) for k in ks for m in ('lightgbm', 'additive_glm')}
    const = np.zeros(len(L.y))
    for f in flex.eval_folds(L, fold):
        tr, te = np.flatnonzero((fold != f) & (fold >= 0)), np.flatnonzero(fold == f)
        rank = next(i['lightgbm_tuned']['ranking'] for i in info if i['repeat'] == 0 and i['fold'] == f)
        rank = [c for c in rank if c != L.dur]
        const[te] = flex.Constant().fit(L, tr).predict(L, te)
        for k in ks:
            feats = rank[:k] + ([L.dur] if L.dur else [])
            P[(k, 'lightgbm')][te] = flex.LGBM(n_configs=args.lc_configs, threads=args.threads, features=feats).fit(L, tr, seed=flex.SEED + int(f)).predict(L, te)
            P[(k, 'additive_glm')][te] = flex.ENetInteractions(top_k=0, features=feats, dur_inter=False, l1_ratios=(0.0,)).fit(L, tr, seed=flex.SEED + int(f)).predict(L, te)
            print(f'  fc fold {f} k={k}', flush=True)
    mk = flex.eval_mask(L)
    V = flex.restrict(L, mk)
    out = [dict(k=k, model=m, heldout_gain=flex.gain(L.family, V.y, P[(k, m)][mk], const[mk], V.w, V.e)) for k in ks for m in ('lightgbm', 'additive_glm')]
    save(L.name, 'feature_curve', dict(rows=out, note='k = number of non-duration features, ranked by each training fold\'s tuned LightGBM gain; '
                                                     'duration (if any) always included; additive_glm = ridge spline GLM (glum)'))
    print(pd.DataFrame(out).pivot(index='k', columns='model', values='heldout_gain').round(3), flush=True)


def stage_oot(L, args):
    if L.oot is None:
        return
    trm, tem = L.oot
    tr, te = np.flatnonzero(trm), np.flatnonzero(tem)
    models = ['baseline', 'lightgbm_tuned', 'enet_spline_pairwise', 'ebm', 'stack_glm_lgbm']
    out, _, info, _, _ = flex.run_fold(L, tr, te, models, flex.SEED + 900,
                                       dict(threads=args.threads, lgb_configs=args.lgb_configs, train_preds=False,
                                            ebm_bags=args.ebm_bags, ebm_max_rows=args.ebm_max_rows))
    sub = dict(L=L, te=te)
    import copy
    Lt = copy.copy(L)
    Lt.y, Lt.w, Lt.group = L.y[te], L.w[te], L.group[te]
    Lt.e = None if L.e is None else L.e[te]
    losses = {k: flex.row_loss(L.family, Lt.y, out[k], Lt.w, Lt.e) for k in ['constant'] + models}
    bt = flex.cluster_boot_gain(Lt, losses, 'baseline', reps=args.boot)
    rows = []
    for k in models:
        cal = flex.calibration(L.family, Lt.y, out[k], Lt.w, Lt.e)
        r = dict(model=k, heldout_gain=bt[k]['gain'], heldout_gain_ci=bt[k]['gain_ci'], diff_vs_baseline=bt[k]['diff'],
                 diff_vs_baseline_ci=bt[k]['diff_ci'], observed_expected=cal['observed_expected'],
                 calibration_slope=cal['calibration_slope'])
        if L.score_fn is not None:
            pt = out['__score__' + k][0]
            pp = L.people.iloc[pt]
            r['harrell_c'] = flex.harrell_c(pp['T'], pp['D'], out['__score__' + k][1], pp['W'])
        else:
            r['auc'] = flex.wauc(out[k], Lt.y, Lt.w)
        rows.append(r)
    save(L.name, 'out_of_time', dict(rows=rows, split=getattr(L, 'oot_label', ''), info=info))
    print(pd.DataFrame(rows).round(3).to_string(index=False), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('lens')
    ap.add_argument('--stages', default='main,null,lc,fc,oot')
    ap.add_argument('--repeats', type=int, default=None)
    ap.add_argument('--models', default=','.join(flex.DEFAULT_MODELS))
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--lgb-configs', type=int, default=12)
    ap.add_argument('--hgb-configs', type=int, default=6)
    ap.add_argument('--lc-configs', type=int, default=4)
    ap.add_argument('--trees', type=int, default=150)
    ap.add_argument('--ebm-bags', type=int, default=8)
    ap.add_argument('--ebm-max-rows', type=int, default=None)
    ap.add_argument('--boot', type=int, default=1000)
    ap.add_argument('--disc-boot', type=int, default=200)
    ap.add_argument('--sample', type=float, default=None, help='grouped subsample fraction (very large lenses)')
    args = ap.parse_args()
    mod = importlib.import_module(f'lenses.{args.lens}')
    L = mod.load(sample=args.sample) if args.sample else mod.load()
    print(f'{L.name}: {len(L.y)} rows, {len(np.unique(L.group))} groups, {L.y.sum():.0f} events, '
          f'{len(L.num)} numeric + {len(L.cat)} categorical features, {len(L.folds)} repeats', flush=True)
    save(L.name, 'data', dict(rows=len(L.y), groups=int(len(np.unique(L.group))), events=float(L.y.sum()), family=L.family,
                              numeric=L.num, categorical=L.cat, duration=L.dur, baseline=L.baseline_label,
                              lens_models=list(L.lens_models), notes=L.notes, sample=args.sample, metric=L.metric_label))
    for st in args.stages.split(','):
        t0 = time.time()
        print(f'== {st}', flush=True)
        dict(main=stage_main, null=stage_null, lc=stage_lc, fc=stage_fc, oot=stage_oot)[st](L, args)
        print(f'== {st} done in {(time.time() - t0) / 60:.1f} min', flush=True)


if __name__ == '__main__':
    main()

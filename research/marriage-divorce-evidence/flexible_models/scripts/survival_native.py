"""Survival-native models on person-level data (one row per marriage, follow-up time and event):
Cox elastic net, random survival forest and gradient-boosted Cox (scikit-survival), against the
lens's baseline Poisson GLM and the tuned LightGBM hazard (their held-out curves come from
export_survival.py). Same outer person folds (repeat 0); tuning on an inner grouped hold-out.

Metrics on each held-out fold, pooled: weighted Harrell's C of the 10-year risk, integrated Brier
score over years 1-10 (IPCW, unweighted; scikit-survival), and the Brier score at 10 years.
Forests and gradient-boosted Cox are fitted on at most MAX_TRAIN training marriages (seeded
subsample) to keep run time bounded; Cox elastic net uses all of them.

Runs in an environment with scikit-survival (it needs a newer scikit-learn than the lenses):
  python survival_native.py <lens>  -> results/<lens>.json key 'survival_native'
"""
import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
SCRATCH = Path('/tmp/claude-0/-home-user-oss-monorepo/923dbe75-fd8c-5824-8bb5-c7e2b6a2405e/scratchpad')
MAX_TRAIN = 12000
H_EVAL = 10
SEED = 20261020


sys.path.insert(0, str(HERE))
from flex import harrell_c as harrell  # noqa: E402  (weighted Harrell's C, O(n log n))


def surv_array(T, D):
    from sksurv.util import Surv
    return Surv.from_arrays(event=D.astype(bool), time=T)


def eval_curves(S, T, D, W, ytrain, times):
    from sksurv.metrics import brier_score, integrated_brier_score
    yte = surv_array(T, D)
    ok = T > 0
    ibs = integrated_brier_score(ytrain, yte[ok], S[ok][:, :len(times)], times)
    _, b10 = brier_score(ytrain, yte[ok], S[ok][:, len(times) - 1], times[-1])
    c = harrell(T, D, 1 - S[:, len(times) - 1], W)
    return dict(c10=float(c), ibs10=float(ibs), brier10=float(b10[0]))


def main():
    lens = sys.argv[1]
    z = np.load(SCRATCH / 'flex_data' / f'surv_{lens}.npz', allow_pickle=True)
    X, T, D, W, fold, group = z['X'].astype(np.float64), z['T'], z['D'], z['W'], z['fold'], z['group']
    T = np.maximum(T, 1e-3)
    times = np.arange(1, H_EVAL + 1, dtype=float)
    from sksurv.ensemble import GradientBoostingSurvivalAnalysis, RandomSurvivalForest
    from sksurv.linear_model import CoxnetSurvivalAnalysis
    rng = np.random.default_rng(SEED)
    models = ['baseline', 'lightgbm_tuned', 'cox_elastic_net', 'random_survival_forest', 'gradient_boosted_cox']
    S = {m: np.full((len(T), H_EVAL), np.nan) for m in models}
    S['baseline'] = z['S_baseline'][:, :H_EVAL]
    S['lightgbm_tuned'] = z['S_lightgbm_tuned'][:, :H_EVAL]
    info = []
    t0 = time.time()
    for f in np.unique(fold[fold >= 0]):
        tr, te = np.flatnonzero((fold != f) & (fold >= 0)), np.flatnonzero(fold == f)
        g = np.unique(group[tr])
        val_g = rng.choice(g, len(g) // 5, replace=False)
        isval = np.isin(group[tr], val_g)
        itr, iva = tr[~isval], tr[isval]
        ytr_all = surv_array(T[tr], D[tr])
        # Cox elastic net: alpha by inner C
        cox = CoxnetSurvivalAnalysis(l1_ratio=0.5, n_alphas=30, alpha_min_ratio=0.001, fit_baseline_model=False, max_iter=200000)
        cox.fit(X[itr], surv_array(T[itr], D[itr]))
        best = max(cox.alphas_, key=lambda a: harrell(T[iva], D[iva], cox.predict(X[iva], alpha=a), W[iva]))
        cox = CoxnetSurvivalAnalysis(l1_ratio=0.5, alphas=[best], fit_baseline_model=True, max_iter=200000).fit(X[tr], ytr_all)
        fn = cox.predict_survival_function(X[te], alpha=best)
        S['cox_elastic_net'][te] = np.array([[s(min(x, s.x[-1])) for x in times] for s in fn])
        # subsample for the tree ensembles
        sub = tr if len(tr) <= MAX_TRAIN else np.sort(rng.choice(tr, MAX_TRAIN, replace=False))
        sub_tr = sub[~np.isin(group[sub], val_g)]
        sub_va = sub[np.isin(group[sub], val_g)]
        cand = {}
        for leaf in (15, 60):
            m = RandomSurvivalForest(n_estimators=100, min_samples_leaf=leaf, max_features='sqrt', n_jobs=2,
                                     random_state=SEED, low_memory=True).fit(X[sub_tr], surv_array(T[sub_tr], D[sub_tr]))
            cand[leaf] = harrell(T[sub_va], D[sub_va], m.predict(X[sub_va]), W[sub_va])
        leaf = max(cand, key=cand.get)
        rsf = RandomSurvivalForest(n_estimators=150, min_samples_leaf=leaf, max_features='sqrt', n_jobs=2,
                                   random_state=SEED).fit(X[sub], surv_array(T[sub], D[sub]))
        fn = rsf.predict_survival_function(X[te])
        S['random_survival_forest'][te] = np.array([[s(min(x, s.x[-1])) for x in times] for s in fn])
        cand = {}
        for n_est, lr in ((150, 0.1), (400, 0.05)):
            m = GradientBoostingSurvivalAnalysis(loss='coxph', n_estimators=n_est, learning_rate=lr, max_depth=3, subsample=0.7,
                                                 random_state=SEED).fit(X[sub_tr], surv_array(T[sub_tr], D[sub_tr]))
            cand[(n_est, lr)] = harrell(T[sub_va], D[sub_va], m.predict(X[sub_va]), W[sub_va])
        n_est, lr = max(cand, key=cand.get)
        gb = GradientBoostingSurvivalAnalysis(loss='coxph', n_estimators=n_est, learning_rate=lr, max_depth=3, subsample=0.7,
                                              random_state=SEED).fit(X[sub], surv_array(T[sub], D[sub]))
        fn = gb.predict_survival_function(X[te])
        S['gradient_boosted_cox'][te] = np.array([[s(min(x, s.x[-1])) for x in times] for s in fn])
        info.append(dict(fold=int(f), cox_alpha=float(best), cox_nonzero=int((np.abs(cox.coef_[:, 0]) > 0).sum()),
                         rsf_min_leaf=int(leaf), gbcox=[int(n_est), float(lr)], tree_train_rows=int(len(sub)),
                         minutes=(time.time() - t0) / 60))
        print(info[-1], flush=True)
    ok = fold >= 0
    ytrain = surv_array(T[ok], D[ok])
    rows = []
    for m in models:
        r = eval_curves(S[m][ok], T[ok], D[ok], W[ok], ytrain, times)
        r['model'] = m
        rows.append(r)
    # person-cluster bootstrap of the C and IBS differences vs baseline (100 draws)
    from sksurv.metrics import integrated_brier_score
    gi = np.unique(group[ok], return_inverse=True)[1]
    boots = {m: [] for m in models}
    Tk, Dk, Wk = T[ok], D[ok], W[ok]
    for b in range(100):
        cnt = np.bincount(rng.integers(0, gi.max() + 1, gi.max() + 1), minlength=gi.max() + 1)[gi]
        idx = np.repeat(np.arange(len(Tk)), cnt)
        for m in models:
            Sm = S[m][ok][idx]
            boots[m].append((harrell(Tk[idx], Dk[idx], 1 - Sm[:, -1], Wk[idx]),
                             integrated_brier_score(ytrain, surv_array(Tk[idx], Dk[idx]), Sm, times)))
        if b % 20 == 0:
            print('boot', b, flush=True)
    base = np.array(boots['baseline'])
    for r in rows:
        bb = np.array(boots[r['model']]) - base
        r['c10_diff_ci'] = np.percentile(bb[:, 0], [2.5, 97.5]).tolist()
        r['ibs10_diff_ci'] = np.percentile(bb[:, 1], [2.5, 97.5]).tolist()
    p = HERE.parent / 'results' / f'{lens}.json'
    d = json.loads(p.read_text())
    d['survival_native'] = dict(rows=rows, info=info, people=int(ok.sum()), events=int(D[ok].sum()),
                                note=f'person-level; tree ensembles on <= {MAX_TRAIN} training marriages; fits unweighted, '
                                     'C weighted; IBS over years 1-10 (IPCW, unweighted); delayed entry not modelled')
    p.write_text(json.dumps(d, indent=1))
    for r in rows:
        print(r)


if __name__ == '__main__':
    main()

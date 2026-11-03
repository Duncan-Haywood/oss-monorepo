#!/usr/bin/env python3
"""Milestone 1: how well do a Christian GSS respondent's other answers predict an item they were not asked?

    GSS_DTA=/path/gss7224_r3a.dta python3 experiments/m1_imputation/run.py [--quick]

Writes results/*.csv next to this file. Hypotheses and the planned analysis are in LOG.md
(2026-11-03 entry), written before this ran. Models:
  prior  weighted share in the training fold, by tradition and decade (what a codebook gives you)
  logit  L2 logistic regression, ordinal items as numbers with a missing indicator, nominal one-hot
  hgb    histogram gradient boosting with native missing values
All fits and metrics use the GSS post-stratification weight wtssps.
"""
import argparse
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'src'))
import gss  # noqa: E402

OUT = Path(__file__).resolve().parent / 'results'
TRADITIONS = ['Catholic', 'Evangelical Protestant', 'Mainline Protestant', 'Black Protestant', 'Orthodox']
MIN_N = 300  # a tradition x item cell below this is reported as too small, not modelled


def make_model(kind, feats):
    if kind == 'logit':
        cat = [f for f in feats if f in gss.CATEGORICAL]
        num = [f for f in feats if f not in gss.CATEGORICAL]
        pre = ColumnTransformer([
            ('num', make_pipeline(SimpleImputer(strategy='median', add_indicator=True), StandardScaler()), num),
            ('cat', make_pipeline(SimpleImputer(strategy='constant', fill_value=-1),
                                  OneHotEncoder(handle_unknown='ignore')), cat)])
        return make_pipeline(pre, LogisticRegression(C=1.0, max_iter=3000))
    if kind == 'hgb':
        return HistGradientBoostingClassifier(
            max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40,
            l2_regularization=1.0, early_stopping=True, validation_fraction=0.15, random_state=0,
            categorical_features=[f in gss.CATEGORICAL for f in feats])
    raise ValueError(kind)


def fit_predict(kind, tr, te, target, feats):
    y = tr[target].values
    if kind == 'prior':
        dec_tr, dec_te = (tr.year // 10), (te.year // 10)
        rates = tr.assign(d=dec_tr, wy=tr.w * y).groupby('d').apply(lambda g: g.wy.sum() / g.w.sum())
        overall = np.average(y, weights=tr.w)
        return dec_te.map(rates).fillna(overall).clip(1e-4, 1 - 1e-4).values
    # Drop features never observed in this training set (items not on the same ballot in those years).
    feats = [f for f in feats if tr[f].notna().any()]
    m = make_model(kind, feats)
    X, Xt = tr[feats], te[feats]
    if kind == 'hgb':
        X, Xt = X.fillna(np.nan).values.astype(float), Xt.values.astype(float)
        # HGB categorical columns must be non-negative ints; NaN stays missing.
        m.fit(X, y, sample_weight=tr.w.values)
    else:
        m.fit(X, y, logisticregression__sample_weight=tr.w.values)
    return m.predict_proba(Xt)[:, 1]


def metrics(y, p, w):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return dict(auc=roc_auc_score(y, p, sample_weight=w), logloss=log_loss(y, p, sample_weight=w),
                brier=np.average((p - y) ** 2, weights=w), base_rate=np.average(y, weights=w))


def paired_boot(y, w, pa, pb, reps, rng):
    """95% interval for AUC(a)-AUC(b) and logloss(a)-logloss(b), resampling respondents."""
    n, da, dl = len(y), [], []
    for _ in range(reps):
        i = rng.integers(0, n, n)
        if y[i].min() == y[i].max():
            continue
        ma, mb = metrics(y[i], pa[i], w[i]), metrics(y[i], pb[i], w[i])
        da.append(ma['auc'] - mb['auc']); dl.append(ma['logloss'] - mb['logloss'])
    q = lambda v: np.percentile(v, [2.5, 97.5])
    return q(da), q(dl)


def oof(df, target, feats, kinds, seed=0):
    """Out-of-fold predictions for every row of df with the target observed."""
    preds = {k: np.zeros(len(df)) for k in kinds}
    skf = StratifiedKFold(5, shuffle=True, random_state=seed)
    for tr_i, te_i in skf.split(df, df[target]):
        tr, te = df.iloc[tr_i], df.iloc[te_i]
        for k in kinds:
            preds[k][te_i] = fit_predict(k, tr, te, target, feats)
    return preds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--quick', action='store_true', help='Catholics, three targets, no bootstrap')
    ap.add_argument('--boot', type=int, default=300)
    ap.add_argument('--reuse-cv', action='store_true', help='reuse the cached step-A predictions')
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    rng = np.random.default_rng(0)
    d = gss.load()
    d = d[d.tradition.isin(TRADITIONS)].reset_index(drop=True)
    targets = list(gss.TARGETS) + list(gss.CATHOLIC_ONLY)
    if a.quick:
        targets = ['attend_weekly', 'premarsx_wrong', 'abortion_no']
    kinds = ['prior', 'logit', 'hgb']

    # Sample sizes (unweighted) per tradition and target.
    pd.DataFrame([dict(tradition=t, target=g, n=int(d.loc[d.tradition == t, g].notna().sum()))
                  for t in TRADITIONS for g in targets]).to_csv(OUT / 'sample_sizes.csv', index=False)

    # A. Within-tradition cross-validation, and B-row storage for transfer comparisons.
    rows, oof_store = [], {}
    trads = ['Catholic'] if a.quick else TRADITIONS
    cache = OUT / 'oof_cache.pkl'  # gitignored; lets steps B-F rerun without redoing A
    if a.reuse_cv and cache.exists():
        oof_store, rows = pd.read_pickle(cache)
        trads = []
    for t in trads:
        for g in targets:
            if g in gss.CATHOLIC_ONLY and t != 'Catholic':
                continue
            df = d[(d.tradition == t) & d[g].notna()].reset_index(drop=True)
            if len(df) < MIN_N or df[g].nunique() < 2:
                rows.append(dict(tradition=t, target=g, n=len(df), note='too few respondents'))
                continue
            feats = gss.features_for(g)
            P = oof(df, g, feats, kinds)
            oof_store[(t, g)] = (df, P)
            y, w = df[g].values, df.w.values
            r = dict(tradition=t, target=g, n=len(df))
            for k in kinds:
                for mk, mv in metrics(y, P[k], w).items():
                    r[f'{k}_{mk}'] = mv
            if not a.quick:
                (alo, ahi), (llo, lhi) = paired_boot(y, w, P['hgb'], P['logit'], a.boot, rng)
                r.update(hgb_minus_logit_auc_lo=alo, hgb_minus_logit_auc_hi=ahi,
                         hgb_minus_logit_ll_lo=llo, hgb_minus_logit_ll_hi=lhi)
                (alo, ahi), (llo, lhi) = paired_boot(y, w, P['logit'], P['prior'], a.boot, rng)
                r.update(logit_minus_prior_ll_lo=llo, logit_minus_prior_ll_hi=lhi)
            rows.append(r)
            print(t, g, len(df), {k: round(r[f'{k}_auc'], 3) for k in kinds}, flush=True)
    pd.DataFrame(rows).to_csv(OUT / 'within_tradition_cv.csv', index=False)
    if not a.quick:
        pd.to_pickle((oof_store, rows), cache)
    if a.quick:
        return

    cath = d[d.tradition == 'Catholic'].reset_index(drop=True)

    # B. Temporal hold-out: Catholics, train 1972-2014, test 2016-2024.
    rows = []
    for g in targets:
        df = cath[cath[g].notna()]
        tr, te = df[df.year <= 2014], df[df.year >= 2016]
        if len(te) < 200 or len(tr) < MIN_N or te[g].nunique() < 2:
            rows.append(dict(target=g, n_train=len(tr), n_test=len(te), note='too few'))
            continue
        feats = gss.features_for(g)
        r = dict(target=g, n_train=len(tr), n_test=len(te))
        for k in kinds:
            for mk, mv in metrics(te[g].values, fit_predict(k, tr, te, g, feats), te.w.values).items():
                r[f'{k}_{mk}'] = mv
        rows.append(r)
    pd.DataFrame(rows).to_csv(OUT / 'temporal_holdout_catholic.csv', index=False)

    # C. Immigrant-generation transfer within Catholics: is a model learned on third-plus-generation
    #    Catholics as good on first-generation (foreign-born) Catholics as the pooled model's own
    #    out-of-fold predictions for them? Same test rows, same features.
    rows = []
    for g in targets:
        if ('Catholic', g) not in oof_store:
            continue
        df, P = oof_store[('Catholic', g)]
        feats = gss.features_for(g)
        g1 = (df.generation == 1).values
        tr3 = df[df.generation == 3]
        if g1.sum() < 150 or df.loc[g1, g].nunique() < 2:
            rows.append(dict(target=g, n_gen1=int(g1.sum()), note='too few'))
            continue
        te = df[g1]
        p3 = fit_predict('hgb', tr3, te, g, feats)
        y, w = te[g].values, te.w.values
        m3, mp = metrics(y, p3, w), metrics(y, P['hgb'][g1], w)
        (alo, ahi), (llo, lhi) = paired_boot(y, w, p3, P['hgb'][g1], a.boot, rng)
        rows.append(dict(target=g, n_gen1=int(g1.sum()), n_gen3_train=len(tr3),
                         gen1_base_rate=m3['base_rate'], gen3_base_rate=np.average(tr3[g], weights=tr3.w),
                         auc_gen3_model=m3['auc'], auc_pooled_oof=mp['auc'],
                         ll_gen3_model=m3['logloss'], ll_pooled_oof=mp['logloss'],
                         mean_pred_gen3_model=np.average(p3, weights=w),
                         auc_diff_lo=alo, auc_diff_hi=ahi, ll_diff_lo=llo, ll_diff_hi=lhi))
    pd.DataFrame(rows).to_csv(OUT / 'generation_transfer_catholic.csv', index=False)

    # D. Tradition transfer: a model fitted on all Catholics, scored on each other tradition,
    #    against that tradition's own within-tradition out-of-fold predictions.
    rows = []
    for t in TRADITIONS[1:]:
        for g in gss.TARGETS:
            if (t, g) not in oof_store or ('Catholic', g) not in oof_store:
                continue
            df, P = oof_store[(t, g)]
            feats = gss.features_for(g)
            pc = fit_predict('hgb', cath[cath[g].notna()], df, g, feats)
            y, w = df[g].values, df.w.values
            mc, mo = metrics(y, pc, w), metrics(y, P['hgb'], w)
            (alo, ahi), (llo, lhi) = paired_boot(y, w, pc, P['hgb'], a.boot, rng)
            rows.append(dict(tradition=t, target=g, n=len(df), auc_catholic_model=mc['auc'],
                             auc_own_oof=mo['auc'], ll_catholic_model=mc['logloss'], ll_own_oof=mo['logloss'],
                             base_rate=mo['base_rate'], mean_pred_catholic_model=np.average(pc, weights=w),
                             auc_diff_lo=alo, auc_diff_hi=ahi, ll_diff_lo=llo, ll_diff_hi=lhi))
    pd.DataFrame(rows).to_csv(OUT / 'tradition_transfer.csv', index=False)

    # E. Which answers carry the signal: permutation importance (log loss) of the Catholic HGB
    #    model on a 25% hold-out, 10 repeats.
    rows = []
    for g in targets:
        df = cath[cath[g].notna()].reset_index(drop=True)
        if len(df) < MIN_N:
            continue
        feats = gss.features_for(g)
        idx = np.random.default_rng(1).permutation(len(df))
        cut = int(0.75 * len(df))
        tr, te = df.iloc[idx[:cut]], df.iloc[idx[cut:]]
        m = make_model('hgb', feats)
        m.fit(tr[feats].values.astype(float), tr[g].values, sample_weight=tr.w.values)
        pi = permutation_importance(m, te[feats].values.astype(float), te[g].values, scoring='neg_log_loss',
                                    n_repeats=10, random_state=0, sample_weight=te.w.values)
        for f, mu, sd in zip(feats, pi.importances_mean, pi.importances_std):
            rows.append(dict(target=g, feature=f, importance=mu, sd=sd))
    pd.DataFrame(rows).to_csv(OUT / 'importance_catholic.csv', index=False)

    # F. Descriptive: weighted share giving the named answer, Catholics, by decade and generation.
    rows = []
    cath = cath.assign(decade=(cath.year // 10) * 10)
    for g in targets:
        for (dec, gen), grp in cath[cath[g].notna()].groupby(['decade', cath.generation.fillna(0)]):
            if len(grp) < 30:
                continue
            rows.append(dict(target=g, decade=int(dec), generation=int(gen), n=len(grp),
                             share=np.average(grp[g], weights=grp.w)))
    pd.DataFrame(rows).to_csv(OUT / 'shares_catholic_decade_generation.csv', index=False)
    print('ok')


if __name__ == '__main__':
    main()

"""Flexible-model benchmark engine: does tuned boosting, a forest, an EBM, an elastic-net GLM with
pairwise interactions or a stacked ensemble beat each lens's current best additive GLM held out?

Every lens loader (lenses/*.py) returns a `Lens`: one row per person-period interval (Poisson
family: events `y` over exposure `e`) or per transition/interval (binary family), the lens's own
grouped outer folds (one array per repeat), its own baseline GLM factory, and the widest feature
set its data hold. This module fits every model family on exactly those folds, tunes each
flexible model with an INNER grouped hold-out carved from the outer training fold only (nested:
the test fold never informs tuning), and returns per-row held-out predictions plus training-fold
fits for the overfitting diagnostics.

Nothing person-level is written inside the repository: results are aggregates only.
"""
from __future__ import annotations

import math
import time
import warnings
from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np
import pandas as pd

warnings.simplefilter('ignore')

SEED = 20261020


# ----------------------------------------------------------------------------- data container
@dataclass
class Lens:
    name: str
    family: str                       # 'poisson' or 'binary'
    df: pd.DataFrame                  # rows (features + anything the baseline needs)
    num: list                         # numeric features (widest set)
    cat: list                         # categorical features (widest set)
    y: np.ndarray                     # events (poisson) or 0/1 (binary)
    w: np.ndarray                     # survey weight per row (mean ~1)
    group: np.ndarray                 # int cluster id per row (person / couple)
    folds: list                       # list (repeats) of int arrays: outer fold per row
    baseline: Callable                # baseline(train_df) -> object with .predict(df) (rate or probability)
    baseline_label: str = ''
    e: Optional[np.ndarray] = None    # exposure (poisson)
    dur: Optional[str] = None         # duration column (person-period lenses)
    lens_models: dict = field(default_factory=dict)   # other existing lens models: name -> factory
    # person-level discrimination (survival lenses): person index per row, person table and a
    # grid scorer giving each person's risk score from a predict function.
    person: Optional[np.ndarray] = None
    people: Optional[pd.DataFrame] = None   # T, D, W (+ entry A optional) and features at baseline
    score_fn: Optional[Callable] = None     # score_fn(predict, people_subset_df) -> risk score per person
    score_label: str = ''
    oot: Optional[tuple] = None             # (train_row_mask, test_row_mask) out-of-time split
    notes: list = field(default_factory=list)
    metric_label: str = ''
    ycol: str = 'y'                         # outcome column in df that the baseline factory reads

    @property
    def features(self):
        return list(self.num) + list(self.cat)

    def offset(self, idx=None):
        if self.family != 'poisson':
            return None
        e = self.e if idx is None else self.e[idx]
        return np.log(np.maximum(e, 1e-12))


# ----------------------------------------------------------------------------- losses
def row_loss(family, y, pred, w, e=None):
    """Weighted per-row loss: Poisson unit deviance (pred = rate) or Bernoulli log loss."""
    y = np.asarray(y, float)
    if family == 'poisson':
        mu = np.maximum(np.asarray(pred, float) * e, 1e-300)
        t = np.where(y > 0, y * np.log(np.where(y > 0, y, 1) / mu), 0.0)
        return 2 * w * (t - (y - mu))
    p = np.clip(np.asarray(pred, float), 1e-9, 1 - 1e-9)
    return -w * (y * np.log(p) + (1 - y) * np.log1p(-p))


def gain(family, y, pred, const, w, e=None):
    return 100 * (1 - row_loss(family, y, pred, w, e).sum() / row_loss(family, y, const, w, e).sum())


def link(family, pred):
    pred = np.asarray(pred, float)
    if family == 'poisson':
        return np.log(np.maximum(pred, 1e-12))
    p = np.clip(pred, 1e-9, 1 - 1e-9)
    return np.log(p / (1 - p))


def inv_link(family, eta):
    if family == 'poisson':
        return np.exp(np.clip(eta, -50, 20))
    return 1 / (1 + np.exp(-eta))


# ----------------------------------------------------------------------------- calibration
def calibration(family, y, pred, w, e=None):
    """O/E, calibration-in-the-large and calibration slope (weighted GLM of y on the linear
    predictor; slope < 1 means predictions too extreme, i.e. overfit), decile lift."""
    eta = link(family, pred)
    if family == 'poisson':
        oe = float(np.dot(w, y) / np.dot(w, pred * e))
        off = np.log(np.maximum(e, 1e-12))
    else:
        oe = float(np.dot(w, y) / np.dot(w, pred))
        off = np.zeros(len(y))
    a, b = 0.0, 1.0
    for _ in range(50):  # Newton for (a, b) in y ~ a + b * eta (+ offset)
        z = a + b * eta + off
        mu = np.exp(np.clip(z, -50, 20)) if family == 'poisson' else 1 / (1 + np.exp(-z))
        v = mu if family == 'poisson' else mu * (1 - mu)
        g = np.array([np.dot(w, y - mu), np.dot(w, (y - mu) * eta)])
        H = np.array([[np.dot(w, v), np.dot(w, v * eta)], [np.dot(w, v * eta), np.dot(w, v * eta * eta)]])
        try:
            step = np.linalg.solve(H, g)
        except np.linalg.LinAlgError:
            break
        a, b = a + step[0], b + step[1]
        if np.abs(step).max() < 1e-9:
            break
    # deciles of predicted risk (weighted), observed rate per decile
    order = np.argsort(eta, kind='stable')
    cw = np.cumsum(w[order]) / w.sum()
    dec = np.empty(len(y), int)
    dec[order] = np.minimum((cw * 10).astype(int), 9)
    den = np.bincount(dec, weights=w * (e if family == 'poisson' else 1.0), minlength=10)
    obs = np.bincount(dec, weights=w * y, minlength=10) / den
    prd = np.bincount(dec, weights=w * pred * (e if family == 'poisson' else 1.0), minlength=10) / den
    overall = np.dot(w, y) / den.sum()
    return dict(observed_expected=oe, calibration_slope=float(b), calibration_intercept=float(a),
                top_decile_lift=float(obs[9] / overall), top_bottom_ratio=float(obs[9] / obs[0]) if obs[0] > 0 else None,
                decile_observed=obs.tolist(), decile_predicted=prd.tolist())


# ----------------------------------------------------------------------------- discrimination
def wauc(score, y, w):
    """Weighted ROC AUC (ties count one half)."""
    score, y, w = map(np.asarray, (score, y, w))
    order = np.argsort(score, kind='mergesort')
    s, yy, ww = score[order], y[order], w[order]
    uniq, start = np.unique(s, return_index=True)
    pos = np.add.reduceat(ww * (yy > 0), start)
    neg = np.add.reduceat(ww * (yy == 0), start)
    cneg = np.cumsum(neg) - neg
    num = np.sum(pos * (cneg + 0.5 * neg))
    den = pos.sum() * neg.sum()
    return float(num / den) if den > 0 else float('nan')


try:
    from numba import njit
except ImportError:  # pragma: no cover
    njit = None


def _harrell_py(t, d, rank, w, n_ranks):
    tree = np.zeros(n_ranks + 1)
    order = np.argsort(-t, kind='mergesort')
    conc = ties = total = tot = 0.0
    i, N = 0, len(order)
    while i < N:
        j = i
        while j < N and t[order[j]] == t[order[i]]:
            j += 1
        for q in range(i, j):
            k = order[q]
            if d[k]:
                r = rank[k]
                s, x = 0.0, r
                while x > 0:
                    s += tree[x]
                    x -= x & -x
                s2, x = 0.0, r + 1
                while x > 0:
                    s2 += tree[x]
                    x -= x & -x
                conc += w[k] * s
                ties += w[k] * (s2 - s)
                total += w[k] * tot
        for q in range(i, j):
            k = order[q]
            x = rank[k] + 1
            while x <= n_ranks:
                tree[x] += w[k]
                x += x & -x
            tot += w[k]
        i = j
    return (conc + 0.5 * ties) / total if total > 0 else np.nan


_harrell = njit(cache=False)(_harrell_py) if njit else _harrell_py


def harrell_c(t, d, score, w):
    """Weighted Harrell's C (pairs comparable when i failed before j's time; w_i w_j)."""
    t, d, score, w = (np.asarray(a, float) for a in (t, d, score, w))
    keep = w > 0
    t, d, score, w = t[keep], d[keep], score[keep], w[keep]
    _, rank = np.unique(score, return_inverse=True)
    return float(_harrell(t, d.astype(np.int64), rank.astype(np.int64), w, int(rank.max()) + 1))


# ----------------------------------------------------------------------------- inner split
def inner_split(groups, seed, frac=0.2):
    """Grouped inner hold-out: returns boolean mask of inner-validation rows."""
    u = np.unique(groups)
    rng = np.random.default_rng(seed)
    val = rng.choice(u, size=max(1, int(round(frac * len(u)))), replace=False)
    return np.isin(groups, val)


# ----------------------------------------------------------------------------- encodings
class TreeFrame:
    """Numeric columns as float (NaN kept), categoricals as pandas categories fixed on training."""

    def __init__(self, num, cat):
        self.num, self.cat = list(num), list(cat)

    def fit(self, df):
        self.levels = {c: sorted(pd.Series(df[c]).astype(str).unique()) for c in self.cat}
        return self

    def transform(self, df):
        out = pd.DataFrame({c: pd.to_numeric(df[c], errors='coerce').astype(float).to_numpy() for c in self.num})
        for c in self.cat:
            out[c] = pd.Categorical(pd.Series(df[c]).astype(str).to_numpy(), categories=self.levels[c])
        return out[self.num + self.cat]

    def dense(self, df):
        """One-hot float matrix (for forests / extra trees)."""
        X = self.transform(df)
        parts = [X[self.num].to_numpy(float)] if self.num else []
        names = list(self.num)
        for c in self.cat:
            codes = X[c].cat.codes.to_numpy()
            k = len(self.levels[c])
            oh = np.zeros((len(X), k), np.float32)
            ok = codes >= 0
            oh[np.flatnonzero(ok), codes[ok]] = 1
            parts.append(oh)
            names += [f'{c}={v}' for v in self.levels[c]]
        self.dense_names = names
        return np.hstack(parts).astype(np.float32) if parts else np.zeros((len(X), 0), np.float32)


# ----------------------------------------------------------------------------- model families
class Constant:
    def fit(self, L, idx):
        if L.family == 'poisson':
            self.v = float(np.dot(L.w[idx], L.y[idx]) / np.dot(L.w[idx], L.e[idx]))
        else:
            self.v = float(np.average(L.y[idx], weights=L.w[idx]))
        return self

    def predict(self, L, idx):
        return np.full(len(idx), self.v)


class Baseline:
    """The lens's own best GLM (its own pipeline, refit on the training rows)."""

    def __init__(self, factory=None):
        self.factory = factory

    def fit(self, L, idx, **_):
        self.m = (self.factory or L.baseline)(L.df.iloc[idx])
        return self

    def predict(self, L, idx=None, df=None):
        return np.asarray(self.m.predict(L.df.iloc[idx] if df is None else df), float)


LGB_SPACE = dict(learning_rate=[0.02, 0.05, 0.1], num_leaves=[4, 8, 16, 31, 63], min_child_frac=[0.0005, 0.002, 0.01, 0.03],
                 lambda_l2=[0.0, 1.0, 10.0, 100.0], feature_fraction=[0.5, 0.8, 1.0], max_depth=[-1, 3, 6])


def sample_configs(space, n, seed):
    rng = np.random.default_rng(seed)
    keys = list(space)
    seen, out = set(), []
    while len(out) < n and len(seen) < 10000:
        c = {k: space[k][rng.integers(len(space[k]))] for k in keys}
        key = tuple(c.items())
        if key not in seen:
            seen.add(key)
            out.append(c)
    return out


class LGBM:
    """LightGBM (Poisson with log-exposure offset, or binary), tuned by random search on the inner
    grouped hold-out with early stopping; refit on the whole training fold with the chosen rounds."""
    name = 'lightgbm_tuned'

    def __init__(self, n_configs=12, threads=2, params=None, features=None, monotone=None, configs=None):
        self.n_configs, self.threads, self.fixed, self.features, self.monotone = n_configs, threads, params, features, monotone
        self.configs = configs

    def _params(self, c, n):
        p = dict(objective='poisson' if self.family == 'poisson' else 'binary', learning_rate=c['learning_rate'],
                 num_leaves=c['num_leaves'], max_depth=c['max_depth'],
                 min_child_samples=max(20, int(c['min_child_frac'] * n)), lambda_l2=c['lambda_l2'],
                 feature_fraction=c['feature_fraction'], bagging_fraction=0.8, bagging_freq=1, verbose=-1,
                 num_threads=self.threads, seed=SEED, min_sum_hessian_in_leaf=1e-3, cat_smooth=10, max_cat_to_onehot=8,
                 deterministic=True, force_col_wise=True)
        if self.monotone is not None:
            p['monotone_constraints'] = self.monotone
            p['monotone_constraints_method'] = 'advanced'
        return p

    def _ds(self, L, idx, ref=None):
        import lightgbm as lgb
        X = self.tf.transform(L.df.iloc[idx])
        # Poisson: LightGBM skips boost_from_average when an init_score is given, so the offset carries
        # log(exposure) PLUS the training log mean rate (self.base); predictions add self.base back.
        init = None if L.family != 'poisson' else L.offset(idx) + self.base
        return lgb.Dataset(X, label=L.y[idx], weight=L.w[idx], init_score=init, reference=ref,
                           categorical_feature=[c for c in self.tf.cat], free_raw_data=False)

    def fit(self, L, idx, seed=SEED, **_):
        import lightgbm as lgb
        self.family = L.family
        feats = self.features or L.features
        self.tf = TreeFrame([c for c in L.num if c in feats], [c for c in L.cat if c in feats]).fit(L.df.iloc[idx])
        n = len(idx)
        self.base = float(np.log(np.dot(L.w[idx], L.y[idx]) / np.dot(L.w[idx], L.e[idx]))) if L.family == 'poisson' else 0.0
        if self.fixed is None:
            val = inner_split(L.group[idx], seed)
            itr, iva = idx[~val], idx[val]
            dtr = self._ds(L, itr)
            dva = self._ds(L, iva, dtr)
            best = None
            self.trials = []
            for c in (self.configs or sample_configs(LGB_SPACE, self.n_configs, seed)):
                b = lgb.train(self._params(c, len(itr)), dtr, num_boost_round=4000, valid_sets=[dva],
                              callbacks=[lgb.early_stopping(100, verbose=False)])
                pred = inv_link(L.family, b.predict(self.tf.transform(L.df.iloc[iva]), raw_score=True) + self.base)
                loss = row_loss(L.family, L.y[iva], pred, L.w[iva], None if L.e is None else L.e[iva]).sum()
                self.trials.append(dict(c, rounds=b.best_iteration, inner_loss=float(loss)))
                if best is None or loss < best[0]:
                    best = (loss, c, b.best_iteration, pred)
            self.config, self.rounds = best[1], max(10, int(round(best[2] / 0.8)))
            self.inner_val = (iva, best[3])
        else:
            self.config, self.rounds = self.fixed
        self.booster = lgb.train(self._params(self.config, n), self._ds(L, idx), num_boost_round=self.rounds)
        return self

    def raw(self, df):
        return self.booster.predict(self.tf.transform(df), raw_score=True) + self.base

    def predict(self, L, idx=None, df=None):
        return inv_link(L.family, self.raw(L.df.iloc[idx] if df is None else df))


HGB_SPACE = dict(learning_rate=[0.03, 0.1], max_leaf_nodes=[7, 15, 31], min_leaf_frac=[0.001, 0.005, 0.02],
                 l2_regularization=[0.0, 1.0, 10.0])


class HGB:
    """sklearn HistGradientBoosting (Poisson on rates with weight*exposure, or log-loss), tuned on the
    inner grouped hold-out; the number of iterations is read off staged predictions."""
    name = 'hgb_tuned'

    def __init__(self, n_configs=6):
        self.n_configs = n_configs

    def _est(self, L, c, n, iters, stop=False):
        from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
        # stop=True (tuning only): sklearn's own early stopping on a 10% row split of the INNER training
        # rows caps the run; the iteration count is then read off the grouped inner hold-out.
        kw = dict(learning_rate=c['learning_rate'], max_leaf_nodes=c['max_leaf_nodes'],
                  min_samples_leaf=max(20, int(c['min_leaf_frac'] * n)), l2_regularization=c['l2_regularization'],
                  max_iter=iters, early_stopping=stop, validation_fraction=0.1, n_iter_no_change=50,
                  random_state=SEED, categorical_features='from_dtype')
        if L.family == 'poisson':
            return HistGradientBoostingRegressor(loss='poisson', **kw)
        return HistGradientBoostingClassifier(**kw)

    def _fit(self, est, L, idx):
        X = self.tf.transform(L.df.iloc[idx])
        if L.family == 'poisson':
            return est.fit(X, L.y[idx] / L.e[idx], sample_weight=L.w[idx] * L.e[idx])
        return est.fit(X, L.y[idx], sample_weight=L.w[idx])

    def _pred_stages(self, est, X):
        if self.family == 'poisson':
            return est.staged_predict(X)
        return (p[:, 1] for p in est.staged_predict_proba(X))

    def fit(self, L, idx, seed=SEED, **_):
        self.family = L.family
        self.tf = TreeFrame(L.num, L.cat).fit(L.df.iloc[idx])
        val = inner_split(L.group[idx], seed)
        itr, iva = idx[~val], idx[val]
        Xva = self.tf.transform(L.df.iloc[iva])
        best = None
        for c in sample_configs(HGB_SPACE, self.n_configs, seed + 1):
            maxit = 1500 if c['learning_rate'] < 0.05 else 600
            est = self._fit(self._est(L, c, len(itr), maxit, stop=True), L, itr)
            for it, pred in enumerate(self._pred_stages(est, Xva)):
                if it % 10:
                    continue
                loss = row_loss(L.family, L.y[iva], pred, L.w[iva], None if L.e is None else L.e[iva]).sum()
                if best is None or loss < best[0]:
                    best = (loss, c, it + 1)
        self.config, self.iters = best[1], max(10, int(round(best[2] / 0.8)))
        self.est = self._fit(self._est(L, self.config, len(idx), self.iters), L, idx)
        return self

    def predict(self, L, idx=None, df=None):
        X = self.tf.transform(L.df.iloc[idx] if df is None else df)
        if L.family == 'poisson':
            return np.maximum(self.est.predict(X), 1e-12)
        return self.est.predict_proba(X)[:, 1]


class Forest:
    """Random forest or extra trees on one-hot inputs: regression of the rate (weight*exposure) or
    of the 0/1 outcome (a probability forest); min leaf and max_features tuned on the inner split."""

    def __init__(self, kind='rf', n_trees=150, threads=2, configs=None):
        self.kind, self.n_trees, self.threads = kind, n_trees, threads
        self.name = 'random_forest_tuned' if kind == 'rf' else 'extra_trees_tuned'
        self.configs = configs or [dict(min_leaf_frac=f, max_features=m) for f in (0.0005, 0.003) for m in (0.33, 0.6)]

    def _est(self, c, n, trees):
        from sklearn.ensemble import ExtraTreesRegressor, RandomForestRegressor
        Est = RandomForestRegressor if self.kind == 'rf' else ExtraTreesRegressor
        kw = dict(n_estimators=trees, min_samples_leaf=max(5, int(c['min_leaf_frac'] * n)), max_features=c['max_features'],
                  n_jobs=self.threads, random_state=SEED)
        if self.kind == 'rf':
            kw['max_samples'] = 0.5 if n > 20000 else None
        else:
            kw['bootstrap'] = False
        return Est(**kw)

    def _fit(self, est, L, idx, X):
        if L.family == 'poisson':
            return est.fit(X, L.y[idx] / L.e[idx], sample_weight=L.w[idx] * L.e[idx])
        return est.fit(X, L.y[idx].astype(float), sample_weight=L.w[idx])

    def _clip(self, L, p):
        lo = 1e-6 if L.family == 'poisson' else 1e-5
        return np.clip(p, lo, None if L.family == 'poisson' else 1 - 1e-5)

    def fit(self, L, idx, seed=SEED, **_):
        self.tf = TreeFrame(L.num, L.cat).fit(L.df.iloc[idx])
        val = inner_split(L.group[idx], seed)
        itr, iva = idx[~val], idx[val]
        Xtr, Xva = self.tf.dense(L.df.iloc[itr]), self.tf.dense(L.df.iloc[iva])
        best = None
        for c in self.configs:
            est = self._fit(self._est(c, len(itr), max(60, self.n_trees // 2)), L, itr, Xtr)
            pred = self._clip(L, est.predict(Xva))
            loss = row_loss(L.family, L.y[iva], pred, L.w[iva], None if L.e is None else L.e[iva]).sum()
            if best is None or loss < best[0]:
                best = (loss, c)
        del Xtr, Xva
        self.config = best[1]
        self.est = self._fit(self._est(self.config, len(idx), self.n_trees), L, idx, self.tf.dense(L.df.iloc[idx]))
        return self

    def predict(self, L, idx=None, df=None):
        return self._clip(L, self.est.predict(self.tf.dense(L.df.iloc[idx] if df is None else df)))


class EBM:
    """Explainable Boosting Machine (a GAM with automatically selected pairwise interactions)."""
    name = 'ebm'

    def __init__(self, interactions=10, outer_bags=8, threads=2, max_rows=None):
        self.interactions, self.outer_bags, self.threads, self.max_rows = interactions, outer_bags, threads, max_rows

    def fit(self, L, idx, seed=SEED, **_):
        from interpret.glassbox import ExplainableBoostingClassifier, ExplainableBoostingRegressor
        self.tf = TreeFrame(L.num, L.cat).fit(L.df.iloc[idx])
        fit_idx = idx
        if self.max_rows and len(idx) > self.max_rows:  # grouped subsample for very large lenses
            g = np.unique(L.group[idx])
            keep = np.random.default_rng(seed).choice(g, int(len(g) * self.max_rows / len(idx)), replace=False)
            fit_idx = idx[np.isin(L.group[idx], keep)]
        X = self._X(L.df.iloc[fit_idx])
        types = ['continuous'] * len(self.tf.num) + ['nominal'] * len(self.tf.cat)
        kw = dict(feature_names=self.tf.num + self.tf.cat, feature_types=types, interactions=self.interactions,
                  outer_bags=self.outer_bags, n_jobs=self.threads, random_state=SEED)
        if L.family == 'poisson':
            self.m = ExplainableBoostingRegressor(objective='poisson_deviance', **kw)
            self.m.fit(X, L.y[fit_idx], sample_weight=L.w[fit_idx], init_score=L.offset(fit_idx))
        else:
            self.m = ExplainableBoostingClassifier(**kw)
            self.m.fit(X, L.y[fit_idx].astype(int), sample_weight=L.w[fit_idx])
        return self

    def _X(self, df):
        X = self.tf.transform(df)
        for c in self.tf.cat:
            X[c] = X[c].astype(str)
        return X

    def predict(self, L, idx=None, df=None):
        X = self._X(L.df.iloc[idx] if df is None else df)
        if L.family == 'poisson':
            return np.maximum(self.m.predict(X), 1e-12)
        return self.m.predict_proba(X)[:, 1]


class ENetInteractions:
    """GLM with natural-ish splines for numerics, one-hot categoricals, all pairwise products among
    the K most important features (ranked on the training fold by a quick LightGBM) and duration x
    every feature; elastic net (glum) with alpha and l1 ratio chosen on the inner grouped hold-out."""
    name = 'enet_spline_pairwise'

    def __init__(self, top_k=6, l1_ratios=(0.5,), features=None, dur_inter=True, max_tune_rows=150000):
        self.top_k, self.l1_ratios, self.features, self.dur_inter = top_k, l1_ratios, features, dur_inter
        self.max_tune_rows = max_tune_rows

    def _base(self, df, fit=False):
        from sklearn.preprocessing import SplineTransformer
        cols, names = [], []
        for c in self.num:
            x = pd.to_numeric(df[c], errors='coerce').astype(float).to_numpy()
            miss = np.isnan(x)
            if fit:
                self.med[c] = float(np.nanmedian(x)) if (~miss).any() else 0.0
            x = np.where(miss, self.med[c], x)
            if fit:
                self.mu[c], self.sd[c] = x.mean(), x.std() or 1.0
                self.spl[c] = SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False,
                                                extrapolation='linear').fit(x[:, None]) if len(np.unique(x)) > 5 else None
            z = (x - self.mu[c]) / self.sd[c]
            cols.append(z[:, None]); names.append((c, f'{c}'))
            if self.spl[c] is not None:
                s = self.spl[c].transform(x[:, None])
                if fit:
                    self.smu[c], self.ssd[c] = s.mean(0), s.std(0) + 1e-9
                cols.append((s - self.smu[c]) / self.ssd[c]); names += [(c, f'{c}_s{j}') for j in range(s.shape[1])]
            if fit:
                self.has_miss[c] = bool(miss.any())
            if self.has_miss[c]:
                cols.append(miss[:, None].astype(float)); names.append((c, f'{c}_missing'))
        for c in self.cat:
            v = pd.Series(df[c]).astype(str).to_numpy()
            if fit:
                vc = pd.Series(v).value_counts()
                self.lv[c] = [l for l in vc.index[1:] if vc[l] >= 30]   # drop the most common level as reference
            oh = np.stack([(v == l).astype(float) for l in self.lv[c]], 1) if self.lv[c] else np.zeros((len(v), 0))
            cols.append(oh); names += [(c, f'{c}={l}') for l in self.lv[c]]
        X = np.hstack(cols)
        return X, names

    def _design(self, df, fit=False):
        X, names = self._base(df, fit)
        # interaction columns: linear z / dummies of each pair of features
        lin = {}
        for j, (f, n) in enumerate(names):
            if n == f or '=' in n:
                lin.setdefault(f, []).append(j)
        pairs = [(a, b) for i, a in enumerate(self.top) for b in self.top[i + 1:]]
        if self.dur and self.dur_inter:   # duration x each screened feature (time-varying effects)
            pairs += [(self.dur, f) for f in self.top if f != self.dur]
        extra = []
        for a, b in pairs:
            for i in lin.get(a, []):
                for j in lin.get(b, []):
                    extra.append(X[:, i] * X[:, j])
        Z = (np.hstack([X, np.stack(extra, 1)]) if extra else X).astype(np.float64)
        if fit:
            self.zmu, self.zsd = Z.mean(0), Z.std(0) + 1e-9
            self.keep = self.zsd > 1e-6
        Z -= self.zmu
        Z /= self.zsd
        return Z[:, self.keep]

    def fit(self, L, idx, seed=SEED, ranking=None, **_):
        from glum import GeneralizedLinearRegressor
        self.family = L.family
        feats = self.features or L.features
        self.num, self.cat = [c for c in L.num if c in feats], [c for c in L.cat if c in feats]
        self.dur = L.dur if L.dur in feats else None
        self.med, self.mu, self.sd, self.spl, self.smu, self.ssd, self.lv, self.has_miss = ({} for _ in range(8))
        if ranking is None and self.top_k:
            ranking = quick_ranking(L, idx, seed)
        self.top = [f for f in (ranking or []) if f != L.dur and f in feats][:self.top_k]
        val = inner_split(L.group[idx], seed)
        itr, iva = idx[~val], idx[val]
        if len(itr) > self.max_tune_rows:   # grouped subsample for the alpha search on very large lenses
            g = np.unique(L.group[itr])
            keep = np.random.default_rng(seed).choice(g, int(len(g) * self.max_tune_rows / len(itr)), replace=False)
            itr = itr[np.isin(L.group[itr], keep)]
        fam = 'poisson' if L.family == 'poisson' else 'binomial'
        Ztr = self._design(L.df.iloc[itr], fit=True)
        Zva = self._design(L.df.iloc[iva])
        best = None
        for l1 in self.l1_ratios:
            m = GeneralizedLinearRegressor(family=fam, l1_ratio=l1, alpha_search=True, n_alphas=15, min_alpha_ratio=1e-4,
                                           max_iter=200)
            m.fit(Ztr, L.y[itr].astype(float), sample_weight=L.w[itr], offset=L.offset(itr))
            for ai, a in enumerate(m._alphas):
                pr = m.predict(Zva, alpha_index=ai, offset=None)
                loss = row_loss(L.family, L.y[iva], pr, L.w[iva], None if L.e is None else L.e[iva]).sum()
                if best is None or loss < best[0]:
                    best = (loss, l1, float(a))
        self.l1, self.alpha = best[1], best[2]
        Z = self._design(L.df.iloc[idx], fit=True)
        self.m = GeneralizedLinearRegressor(family=fam, l1_ratio=self.l1, alpha=self.alpha, max_iter=500)
        self.m.fit(Z, L.y[idx].astype(float), sample_weight=L.w[idx], offset=L.offset(idx))
        self.n_terms = int(Z.shape[1])
        self.n_nonzero = int((np.abs(self.m.coef_) > 1e-10).sum())
        return self

    def predict(self, L, idx=None, df=None):
        Z = self._design(L.df.iloc[idx] if df is None else df)
        return np.clip(self.m.predict(Z), 1e-12, None if self.family == 'poisson' else 1 - 1e-9)


def quick_ranking(L, idx, seed):
    """Feature ranking by total split gain of a small LightGBM fitted on the training rows only."""
    import lightgbm as lgb
    tf = TreeFrame(L.num, L.cat).fit(L.df.iloc[idx])
    p = dict(objective='poisson' if L.family == 'poisson' else 'binary', learning_rate=0.05, num_leaves=15,
             min_child_samples=max(20, len(idx) // 500), verbose=-1, num_threads=2, seed=seed, lambda_l2=10.0)
    init = None if L.family != 'poisson' else L.offset(idx) + np.log(np.dot(L.w[idx], L.y[idx]) / np.dot(L.w[idx], L.e[idx]))
    b = lgb.train(p, lgb.Dataset(tf.transform(L.df.iloc[idx]), L.y[idx], weight=L.w[idx], init_score=init,
                                 categorical_feature=tf.cat), 300)
    imp = b.feature_importance('gain')
    return [f for _, f in sorted(zip(-imp, tf.num + tf.cat))]


class Stack:
    """Blend of the baseline GLM and tuned LightGBM on the link scale; the weight is chosen on the
    LightGBM's inner grouped hold-out (baseline refit on the inner-training rows for that)."""
    name = 'stack_glm_lgbm'

    def __init__(self, glm, lgbm):
        self.glm, self.lgbm = glm, lgbm

    def fit(self, L, idx, seed=SEED, **_):
        iva, p_l = self.lgbm.inner_val
        itr = np.setdiff1d(idx, iva)
        p_g = Baseline().fit(L, itr).predict(L, iva)
        best = None
        for a in np.linspace(0, 1, 11):
            pr = inv_link(L.family, a * link(L.family, p_g) + (1 - a) * link(L.family, p_l))
            loss = row_loss(L.family, L.y[iva], pr, L.w[iva], None if L.e is None else L.e[iva]).sum()
            if best is None or loss < best[0]:
                best = (loss, a)
        self.a = float(best[1])
        return self

    def predict(self, L, idx=None, df=None):
        return inv_link(L.family, self.a * link(L.family, self.glm.predict(L, idx, df)) +
                        (1 - self.a) * link(L.family, self.lgbm.predict(L, idx, df)))


# ----------------------------------------------------------------------------- the benchmark
def eval_folds(L, fold):
    """Outer folds to score: all of them, or the lens's single held-out fold (ACS)."""
    ef = getattr(L, 'eval_folds', None)
    return list(ef) if ef else [f for f in np.unique(fold) if f >= 0]


def eval_mask(L, r=0):
    return np.isin(L.folds[r], eval_folds(L, L.folds[r]))


def restrict(L, mask):
    """View of the lens on the scored rows only (for summaries)."""
    import copy
    V = copy.copy(L)
    V.y, V.w, V.group = L.y[mask], L.w[mask], L.group[mask]
    V.e = None if L.e is None else L.e[mask]
    return V

DEFAULT_MODELS = ('baseline', 'lightgbm_tuned', 'hgb_tuned', 'random_forest_tuned', 'extra_trees_tuned',
                  'enet_spline_pairwise', 'ebm', 'stack_glm_lgbm')


def run_fold(L, tr, te, models, seed, opts):
    """Fit every model on outer-training rows `tr`; return held-out and training predictions."""
    out, info, tim = {}, {}, {}
    trp = {}
    c = Constant().fit(L, tr)
    out['constant'], trp['constant'] = c.predict(L, te), c.predict(L, tr)
    fitted = {'constant': c}
    ranking = None
    for k in models:
        t0 = time.time()
        if k == 'baseline':
            m = Baseline().fit(L, tr)
        elif k in L.lens_models:
            m = Baseline(L.lens_models[k]).fit(L, tr)
        elif k == 'lightgbm_tuned':
            m = LGBM(n_configs=opts.get('lgb_configs', 12), threads=opts.get('threads', 2)).fit(L, tr, seed=seed)
            info[k] = dict(config=m.config, rounds=m.rounds)
            imp = m.booster.feature_importance('gain')
            ranking = [f for _, f in sorted(zip(-imp, m.tf.num + m.tf.cat))]
            info[k]['ranking'] = ranking
        elif k == 'hgb_tuned':
            m = HGB(n_configs=opts.get('hgb_configs', 6)).fit(L, tr, seed=seed)
            info[k] = dict(config=m.config, iters=m.iters)
        elif k == 'random_forest_tuned':
            m = Forest('rf', n_trees=opts.get('trees', 150), threads=opts.get('threads', 2)).fit(L, tr, seed=seed)
            info[k] = dict(config=m.config)
        elif k == 'extra_trees_tuned':
            m = Forest('et', n_trees=opts.get('trees', 150), threads=opts.get('threads', 2)).fit(L, tr, seed=seed)
            info[k] = dict(config=m.config)
        elif k == 'enet_spline_pairwise':
            m = ENetInteractions(top_k=opts.get('top_k', 6)).fit(L, tr, seed=seed, ranking=ranking)
            info[k] = dict(l1_ratio=m.l1, alpha=m.alpha, terms=m.n_terms, nonzero=m.n_nonzero, pairs_among=m.top)
        elif k == 'ebm':
            m = EBM(interactions=opts.get('ebm_interactions', 10), outer_bags=opts.get('ebm_bags', 8),
                    threads=opts.get('threads', 2), max_rows=opts.get('ebm_max_rows')).fit(L, tr, seed=seed)
        elif k == 'stack_glm_lgbm':
            m = Stack(fitted['baseline'], fitted['lightgbm_tuned']).fit(L, tr, seed=seed)
            info[k] = dict(glm_weight=m.a)
        else:
            raise KeyError(k)
        fitted[k] = m
        out[k] = m.predict(L, te)
        if L.score_fn is not None:
            pt = np.unique(L.person[te])
            out['__score__' + k] = (pt, L.score_fn(lambda df, m=m: m.predict(L, df=df), L.people.iloc[pt]))
        trp[k] = m.predict(L, tr) if opts.get('train_preds', True) else None
        tim[k] = time.time() - t0
        print(f'    {L.name} {k}: {tim[k]:.0f}s', flush=True)
    return out, trp, info, tim, fitted


def benchmark(L, models=DEFAULT_MODELS, repeats=None, opts=None, log=print):
    """Outer CV over the lens's folds. Returns per-repeat held-out predictions (rows), training-fold
    gains, tuning info and timings."""
    opts = opts or {}
    reps = range(len(L.folds)) if repeats is None else range(min(repeats, len(L.folds)))
    preds, train_gain, infos, times = [], [], [], []
    for r in reps:
        fold = L.folds[r]
        P = {k: np.zeros(len(L.y)) for k in ['constant'] + list(models)}
        S = {k: np.full(len(L.people), np.nan) for k in models} if L.score_fn is not None else None
        tg = {k: [] for k in models}
        for f in eval_folds(L, fold):
            tr, te = np.flatnonzero((fold != f) & (fold >= 0)), np.flatnonzero(fold == f)
            log(f'  {L.name} repeat {r} fold {f}: {len(tr)} train rows, {len(te)} test rows')
            out, trp, info, tim, _ = run_fold(L, tr, te, models, SEED + 100 * r + int(f), opts)
            for k, v in out.items():
                if k.startswith('__score__'):
                    S[k[9:]][v[0]] = v[1]
                else:
                    P[k][te] = v
            for k in models:
                if trp[k] is not None:
                    tg[k].append(gain(L.family, L.y[tr], trp[k], trp['constant'], L.w[tr], None if L.e is None else L.e[tr]))
            infos.append(dict(repeat=r, fold=int(f), **info))
            if opts.get('hook') and r == 0:
                opts['hook'](L, r, int(f), tr, te, _)
            times.append(dict(repeat=r, fold=int(f), **tim))
        if S is not None:
            P['__scores__'] = S
        preds.append(P)
        train_gain.append({k: float(np.mean(v)) if v else None for k, v in tg.items()})
    return dict(preds=preds, train_gain=train_gain, info=infos, times=times)


# ----------------------------------------------------------------------------- summaries
def cluster_boot_gain(L, losses, ref, reps=1000, seed=SEED):
    """Paired cluster bootstrap of held-out gain (vs constant) and its difference from `ref`."""
    codes, uniq = pd.factorize(pd.Series(L.group))
    G = len(uniq)
    sums = {k: np.bincount(codes, weights=v, minlength=G) for k, v in losses.items()}
    rng = np.random.default_rng(seed)
    B = {k: np.empty(reps) for k in losses}
    for b in range(reps):
        cnt = np.bincount(rng.integers(0, G, G), minlength=G).astype(float)
        base = cnt @ sums['constant']
        for k in losses:
            B[k][b] = 100 * (1 - (cnt @ sums[k]) / base)
    point = {k: 100 * (1 - sums[k].sum() / sums['constant'].sum()) for k in losses}
    res = {}
    for k in losses:
        d = B[k] - B[ref]
        res[k] = dict(gain=point[k], gain_ci=[float(np.percentile(B[k], 2.5)), float(np.percentile(B[k], 97.5))],
                      diff=point[k] - point[ref], diff_ci=[float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))])
    return res


def summarise(L, bench, ref='baseline', boot=1000, extra_scores=None):
    preds = bench['preds']
    models = [k for k in preds[0] if k not in ('constant', '__scores__')]
    e = L.e
    # losses averaged over repeats (each row's held-out loss), paired bootstrap
    losses = {k: np.mean([row_loss(L.family, L.y, P[k], L.w, e) for P in preds], axis=0) for k in ['constant'] + models}
    bt = cluster_boot_gain(L, losses, ref, reps=boot)
    rows = []
    for k in models:
        per_rep = [gain(L.family, L.y, P[k], P['constant'], L.w, e) for P in preds]
        cal = [calibration(L.family, L.y, P[k], L.w, e) for P in preds]
        tg = [t[k] for t in bench['train_gain'] if t.get(k) is not None]
        r = dict(model=k, heldout_gain=bt[k]['gain'], heldout_gain_ci=bt[k]['gain_ci'],
                 diff_vs_baseline=bt[k]['diff'], diff_vs_baseline_ci=bt[k]['diff_ci'],
                 heldout_gain_by_repeat=per_rep,
                 train_gain=float(np.mean(tg)) if tg else None,
                 train_minus_heldout=(float(np.mean(tg)) - float(np.mean(per_rep))) if tg else None,
                 observed_expected=float(np.mean([c['observed_expected'] for c in cal])),
                 calibration_slope=float(np.mean([c['calibration_slope'] for c in cal])),
                 calibration_intercept=float(np.mean([c['calibration_intercept'] for c in cal])),
                 top_decile_lift=float(np.mean([c['top_decile_lift'] for c in cal])),
                 top_bottom_ratio=float(np.nanmean([c['top_bottom_ratio'] or np.nan for c in cal])),
                 decile_observed=cal[0]['decile_observed'], decile_predicted=cal[0]['decile_predicted'])
        rows.append(r)
    return rows

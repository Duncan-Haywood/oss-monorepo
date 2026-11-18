"""Milestone 14 (H1): two more baselines against the reference-class bar, on the same split as boosted.py.

XGBoost quantile (reg:quantileerror, hist, early stopping on the calibration year) and a linear
quantile regression (sklearn QuantileRegressor, one-hot features, fitted on a fixed random
subsample of the training rows because the exact LP does not scale to 10^5+ rows). Same features,
same split, same week-block bootstrap as boosted.py. Run:
  python3 src/baselines.py DATA_DIR --city chicago --target a2i --test-year 2024 [--seeds 3] [--lin-n 20000]
"""
import argparse, json, os, sys
import numpy as np, pandas as pd, xgboost as xgb
from sklearn.linear_model import QuantileRegressor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness, boosted  # noqa: E402

TAUS = harness.TAUS
pin, block_boot = boosted.pin, boosted.block_boot


def xgb_fit_predict(Xtr, ytr, Xca, yca, Xte, seed, n_max=300):
    out, rounds = {}, {}
    for t in TAUS:
        p = dict(objective="reg:quantileerror", quantile_alpha=t, tree_method="hist", learning_rate=0.15,
                 max_depth=6, min_child_weight=100, subsample=0.8, colsample_bytree=0.8, seed=seed,
                 nthread=4, enable_categorical=True, max_cat_to_onehot=1)
        dtr, dca, dte = (xgb.DMatrix(X, label=y, enable_categorical=True) for X, y in
                         ((Xtr, ytr), (Xca, yca), (Xte, np.zeros(len(Xte)))))
        m = xgb.train(p, dtr, n_max, evals=[(dca, "ca")], early_stopping_rounds=30, verbose_eval=False)
        out[t] = np.maximum(m.predict(dte, iteration_range=(0, m.best_iteration + 1)), 0)
        rounds[t] = m.best_iteration + 1
    return out, rounds


def design(Xtr, others):
    """One-hot the categoricals, fill missing log-cost with the training median and add a flag."""
    med = float(Xtr["log_cost"].median())
    cols = None
    outs = []
    for d in [Xtr] + others:
        x = d.copy()
        x["cost_missing"] = x["log_cost"].isna().astype(float)
        x["log_cost"] = x["log_cost"].fillna(med)
        x["desc_len"] = x["desc_len"].fillna(float(Xtr["desc_len"].median()))
        x = pd.get_dummies(x, columns=["permit_type", "work_class", "area", "month", "dow"], dtype=float)
        if cols is None:
            cols = list(x.columns)
        outs.append(x.reindex(columns=cols, fill_value=0.0))
    mu, sd = outs[0].mean(), outs[0].std().replace(0, 1)
    return [((o - mu) / sd).to_numpy() for o in outs]


def lin_fit_predict(Xtr, ytr, Xte, n, seed):
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(Xtr), size=min(n, len(Xtr)), replace=False)
    out = {}
    for t in TAUS:
        m = QuantileRegressor(quantile=t, alpha=0.0, solver="highs").fit(Xtr[idx], ytr[idx])
        out[t] = np.maximum(m.predict(Xte), 0)
    return out


def run(df, test_year, seeds, lin_n, neg=0):
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    Xtr, Xca, Xte = boosted.featurise(tr, [ca, te])
    ytr, yca, yte = tr.y.to_numpy(float), ca.y.to_numpy(float), te.y.to_numpy(float)
    base = harness.ReferenceClass([dict(type=t, y=y) for t, y in zip(tr.permit_type, tr.y)])
    bq = {t: np.array([base.predict(k)[t] for k in te.permit_type]) for t in TAUS}
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    res = dict(test_year=test_year, n_train=len(tr), n_calib=len(ca), n_test=len(te), seeds=seeds,
               lin_n=lin_n, negative_dropped=neg)
    res["baseline_pinball"] = {str(t): float(pin(yte, bq[t], t).mean()) for t in TAUS}
    P = {t: [] for t in TAUS}; R = []
    for s in range(seeds):
        pr, rd = xgb_fit_predict(Xtr, ytr, Xca, yca, Xte, seed=s)
        for t in TAUS:
            P[t].append(pr[t])
        R.append(rd)
    res["xgb_rounds"] = R
    Dtr, Dte = design(Xtr, [Xte])
    L = {t: [] for t in TAUS}
    for s in range(seeds):
        lp = lin_fit_predict(Dtr, ytr, Dte, lin_n, s)
        for t in TAUS:
            L[t].append(lp[t])
    for name, Q in (("xgb", P), ("linear", L)):
        res[name] = {}
        for t in TAUS:
            lb = np.mean([pin(yte, p, t) for p in Q[t]], axis=0)
            d = lb - pin(yte, bq[t], t)
            m, lo, hi = block_boot(d, wk)
            res[name][str(t)] = dict(pinball=float(lb.mean()), diff=m, lo=lo, hi=hi,
                                     rel=m / res["baseline_pinball"][str(t)],
                                     per_seed=[float(pin(yte, p, t).mean()) for p in Q[t]])
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir"); ap.add_argument("--city", required=True, choices=["chicago", "sf", "austin", "seattle"])
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=3); ap.add_argument("--lin-n", type=int, default=20000)
    a = ap.parse_args()
    df, neg = boosted.load_frame(os.path.join(a.data_dir, f"{a.city}.csv"), a.target)
    r = run(df, a.test_year, a.seeds, a.lin_n, neg)
    r.update(city=a.city, target=a.target)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"baselines_{a.city}_{a.target}_{a.test_year}.json")
    json.dump(r, open(out, "w"), indent=1)
    for n in ("xgb", "linear"):
        print(n, {k: f"{v['rel']:+.3f} [{v['lo']/r['baseline_pinball'][k]:+.3f},{v['hi']/r['baseline_pinball'][k]:+.3f}]" for k, v in r[n].items()})

"""Milestone 17 (H1): CatBoost quantile models against the reference-class bar, same split as boosted.py.

CatBoost (loss Quantile:alpha=tau, native categoricals, early stopping on the calibration year),
same features, split, 3 seeds and week-block bootstrap as boosted.py and baselines.py. Run:
  python3 src/catboost_run.py DATA_DIR --city sf --target i2c --test-year 2024 [--seeds 3]
"""
import argparse, json, os, sys
import numpy as np
from catboost import CatBoostRegressor, Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness, boosted  # noqa: E402

TAUS = harness.TAUS
pin, block_boot = boosted.pin, boosted.block_boot
CATS = boosted.CATS


def prep(X):
    x = X.copy()
    for c in CATS:
        x[c] = x[c].astype(object).where(x[c].notna(), "__unseen__").astype(str)  # level absent from training
    return x


def cb_fit_predict(Xtr, ytr, Xca, yca, Xte, seed, n_max=300):
    out, rounds = {}, {}
    Xtr, Xca, Xte = prep(Xtr), prep(Xca), prep(Xte)
    for t in TAUS:
        m = CatBoostRegressor(loss_function=f"Quantile:alpha={t}", iterations=n_max, learning_rate=0.15,
                              depth=6, random_seed=seed, thread_count=4, verbose=False,
                              early_stopping_rounds=30, cat_features=CATS)
        m.fit(Pool(Xtr, ytr, cat_features=CATS), eval_set=Pool(Xca, yca, cat_features=CATS))
        out[t] = np.maximum(m.predict(Pool(Xte, cat_features=CATS)), 0)
        rounds[t] = int(m.get_best_iteration()) + 1
    return out, rounds


def run(df, test_year, seeds, neg=0):
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    Xtr, Xca, Xte = boosted.featurise(tr, [ca, te])
    ytr, yca, yte = tr.y.to_numpy(float), ca.y.to_numpy(float), te.y.to_numpy(float)
    base = harness.ReferenceClass([dict(type=t, y=y) for t, y in zip(tr.permit_type, tr.y)])
    bq = {t: np.array([base.predict(k)[t] for k in te.permit_type]) for t in TAUS}
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    res = dict(test_year=test_year, n_train=len(tr), n_calib=len(ca), n_test=len(te), seeds=seeds,
               negative_dropped=neg)
    res["baseline_pinball"] = {str(t): float(pin(yte, bq[t], t).mean()) for t in TAUS}
    P = {t: [] for t in TAUS}; R = []
    for s in range(seeds):
        pr, rd = cb_fit_predict(Xtr, ytr, Xca, yca, Xte, seed=s)
        for t in TAUS:
            P[t].append(pr[t])
        R.append(rd)
    res["catboost_rounds"] = R
    res["catboost"] = {}
    for t in TAUS:
        lb = np.mean([pin(yte, p, t) for p in P[t]], axis=0)
        d = lb - pin(yte, bq[t], t)
        m, lo, hi = block_boot(d, wk)
        res["catboost"][str(t)] = dict(pinball=float(lb.mean()), diff=m, lo=lo, hi=hi,
                                       rel=m / res["baseline_pinball"][str(t)],
                                       per_seed=[float(pin(yte, p, t).mean()) for p in P[t]])
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir"); ap.add_argument("--city", required=True, choices=["chicago", "sf", "austin"])
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=3)
    a = ap.parse_args()
    df, neg = boosted.load_frame(os.path.join(a.data_dir, f"{a.city}.csv"), a.target)
    r = run(df, a.test_year, a.seeds, neg)
    r.update(city=a.city, target=a.target)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"catboost_{a.city}_{a.target}_{a.test_year}.json")
    json.dump(r, open(out, "w"), indent=1)
    print({k: f"{v['rel']:+.3f} [{v['lo']/r['baseline_pinball'][k]:+.3f},{v['hi']/r['baseline_pinball'][k]:+.3f}]" for k, v in r["catboost"].items()})

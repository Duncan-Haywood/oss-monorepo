"""Milestone 9: linear quantile regression against the baseline and the boosted model.

Needs pandas, numpy, scipy, scikit-learn, lightgbm (for boosted.py's loaders). Run:
  python3 src/linear.py DATA_DIR --city sf --target a2i --test-year 2024 [--max-train 60000]

Same split, features and loss as boosted.py. Features are one-hot (permit type, work class,
area top 60 plus other), log cost with a missing flag, description length, month and weekday as
one-hot. QuantileRegressor(alpha=0, solver="highs") fits each tau on a random subsample of at
most --max-train training rows (fixed seed): the exact LP is too slow on 500k rows. Predictions
are floored at 0. The test year is touched once; there is no tuning, so no calibration use.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd
from sklearn.linear_model import QuantileRegressor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, harness  # noqa: E402

TAUS = harness.TAUS


def design(tr, others):
    top = set(tr["area"].value_counts().head(60).index)
    def mk(d):
        x = pd.DataFrame(index=d.index)
        x["log_cost"] = d["log_cost"].fillna(0)
        x["cost_missing"] = d["log_cost"].isna().astype(float)
        x["desc_len"] = np.log1p(d["desc_len"].fillna(0))
        parts = [x]
        for c, v in (("pt", d["permit_type"]), ("wc", d["work_class"]),
                     ("ar", d["area"].where(d["area"].isin(top), "other")),
                     ("mo", d["month"].astype(str)), ("dw", d["dow"].astype(str))):
            parts.append(pd.get_dummies(v, prefix=c).astype(float))
        return pd.concat(parts, axis=1)
    cols = mk(tr).columns
    return [mk(d).reindex(columns=cols, fill_value=0.0) for d in [tr] + others]


def run(df, test_year, max_train, neg=0, seed=0):
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    if not (len(tr) and len(ca) and len(te)):
        raise SystemExit("empty split")
    Xtr, Xte = design(tr, [te])
    ytr, yte = tr.y.to_numpy(float), te.y.to_numpy(float)
    idx = np.random.default_rng(seed).permutation(len(tr))[:max_train]
    mu, sd = Xtr.iloc[idx].mean(), Xtr.iloc[idx].std().replace(0, 1)
    A, B = ((Xtr.iloc[idx] - mu) / sd).to_numpy(), ((Xte - mu) / sd).to_numpy()
    base = harness.ReferenceClass([dict(type=t, y=y) for t, y in zip(tr.permit_type, tr.y)])
    bq = {t: np.array([base.predict(k)[t] for k in te.permit_type]) for t in TAUS}
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    res = dict(test_year=test_year, n_train=len(tr), n_fit=len(idx), n_test=len(te),
               negative_dropped=neg, n_features=A.shape[1], h6={}, pinball={}, baseline_pinball={})
    for t in TAUS:
        m = QuantileRegressor(quantile=t, alpha=0.0, solver="highs").fit(A, ytr[idx])
        q = np.maximum(m.predict(B), 0)
        d = boosted.pin(yte, q, t) - boosted.pin(yte, bq[t], t)   # negative = linear better
        mean, lo, hi = boosted.block_boot(d, wk)
        res["pinball"][str(t)] = float(boosted.pin(yte, q, t).mean())
        res["baseline_pinball"][str(t)] = float(boosted.pin(yte, bq[t], t).mean())
        res["h6"][str(t)] = dict(diff=mean, lo=lo, hi=hi, rel=mean / res["baseline_pinball"][str(t)])
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--city", required=True, choices=["chicago", "sf", "austin"])
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--max-train", type=int, default=60000)
    a = ap.parse_args()
    df, neg = boosted.load_frame(os.path.join(a.data_dir, f"{a.city}.csv"), a.target)
    r = run(df, a.test_year, a.max_train, neg)
    r.update(city=a.city, target=a.target)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"linear_{a.city}_{a.target}_{a.test_year}.json")
    json.dump(r, open(out, "w"), indent=1)
    print(json.dumps(r, indent=1))

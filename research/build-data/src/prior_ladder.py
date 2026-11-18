"""Milestone 7c: which table dimensions carry the boosted gain? A feature ladder (H7).

Session 50 (prior_boosted.py) flattened the boosted model to a type x cost-bucket table and kept
little of its gain. This asks the design question underneath: refit the same LightGBM quantile
models on nested feature subsets and report the share of the full model's mean pinball gain over the
per-type baseline that each subset keeps. A subset that keeps >= 50% with few dimensions is a
candidate for a readable table. Same split as the harness (train <= Y-2, calibration Y-1 picks the
tree count, test Y). Needs pandas, numpy, lightgbm.
  python3 src/prior_ladder.py DATA_DIR --test-year 2024 [--seeds 2]
"""
import argparse, json, os, sys
import numpy as np, pandas as pd, lightgbm as lgb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, harness  # noqa: E402

TAUS = harness.TAUS
LADDER = {
    "type": ["permit_type"],
    "type+cost": ["permit_type", "log_cost"],
    "+work_class": ["permit_type", "log_cost", "work_class"],
    "+desc_len": ["permit_type", "log_cost", "work_class", "desc_len"],
    "+area": ["permit_type", "log_cost", "work_class", "desc_len", "area"],
    "all": ["permit_type", "log_cost", "work_class", "desc_len", "area", "month", "dow"],
}
FILES = {"chicago": ("a2i",), "sf": ("a2i", "i2c"), "austin": ("a2i", "i2c")}


def share(base, model, full):
    """Share of the full model's gain over base that `model` keeps (None if full has no gain)."""
    g = base - full
    return float((base - model) / g) if g > 0 else None


def fit_subset(Xtr, ytr, Xca, yca, Xte, cols, seed):
    out = {}
    base = dict(learning_rate=0.15, num_leaves=63, min_data_in_leaf=100, feature_fraction=1.0 if len(cols) == 1 else 0.8,
                bagging_fraction=0.8, bagging_freq=1, seed=seed, verbose=-1, num_threads=4)
    for t in TAUS:
        p = dict(base, objective="quantile", alpha=t, metric="quantile")
        m = lgb.train(p, lgb.Dataset(Xtr[cols], ytr), 300, valid_sets=[lgb.Dataset(Xca[cols], yca)],
                      callbacks=[lgb.early_stopping(30, verbose=False)])
        out[t] = np.maximum(m.predict(Xte[cols], num_iteration=m.best_iteration), 0)
    return out


def run(df, test_year, seeds):
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    Xtr, Xca, Xte = boosted.featurise(tr, [ca, te])
    ytr, yca, yte = (d.y.to_numpy(float) for d in (tr, ca, te))
    base = harness.ReferenceClass([dict(type=a, y=b) for a, b in zip(tr.permit_type, tr.y)])
    bl = {t: float(boosted.pin(yte, np.array([base.predict(k)[t] for k in te.permit_type]), t).mean()) for t in TAUS}
    loss = {}
    for name, cols in LADDER.items():
        P = [fit_subset(Xtr, ytr, Xca, yca, Xte, cols, s) for s in range(seeds)]
        loss[name] = {t: float(boosted.pin(yte, np.mean([p[t] for p in P], axis=0), t).mean()) for t in TAUS}
    res = dict(test_year=test_year, n_test=len(te), seeds=seeds, baseline={str(t): bl[t] for t in TAUS}, ladder={})
    for name in LADDER:
        sh = [share(bl[t], loss[name][t], loss["all"][t]) for t in TAUS]
        res["ladder"][name] = dict(pinball={str(t): loss[name][t] for t in TAUS},
                                   mean_share=float(np.mean([s for s in sh if s is not None])) if any(s is not None for s in sh) else None)
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir"); ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=2)
    a = ap.parse_args()
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    out = []
    for city, targets in FILES.items():
        for tg in targets:
            df, _ = boosted.load_frame(os.path.join(a.data_dir, f"{city}.csv"), tg)
            r = run(df, a.test_year, a.seeds); r.update(city=city, target=tg); out.append(r)
            print(city, tg, {k: None if v["mean_share"] is None else round(v["mean_share"], 2) for k, v in r["ladder"].items()}, flush=True)
    json.dump(out, open(os.path.join(here, f"prior_ladder_{a.test_year}.json"), "w"), indent=1)

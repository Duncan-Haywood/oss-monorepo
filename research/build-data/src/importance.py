"""Milestone 5: permutation importance of the boosted quantile models (H3).

Needs pandas, numpy, scipy, lightgbm. Run:
  python3 src/importance.py DATA_DIR --city sf --target a2i --test-year 2024 [--seeds 3] [--repeats 5]

Same split, features and configuration as src/boosted.py (train <= Y-2, early-stopping
year Y-1, test Y). For each fitted model (one per seed and quantile), one feature column of
the test rows is permuted (all test rows shuffled together, `repeats` times) and the rise in
mean pinball loss is the feature's importance. Importance is summed over the three quantiles,
so it is in days of pinball loss. The feature's share is its positive importance over the sum
of positive importances; k80 is the smallest number of features whose shares reach 0.8
when sorted. H3 (PROPOSAL.md): k80 <= 5. Also reported: the model's gain over the baseline on
the same rows, and the fraction of that gain the permutation importances sum to (they need
not add up; permuting breaks correlated columns together, so the sum can exceed or fall
short of the gain; it is shown, not forced to 1).
Ablation: refit each model with one feature removed (drop-one, first seed only) and report the loss rise.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd, lightgbm as lgb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness, boosted  # noqa: E402

TAUS = harness.TAUS


def fit_models(Xtr, ytr, Xca, yca, seed, n_max=300):
    base = dict(learning_rate=0.15, num_leaves=63, min_data_in_leaf=100, feature_fraction=0.8,
                bagging_fraction=0.8, bagging_freq=1, seed=seed, verbose=-1, num_threads=4)
    ms = {}
    for t in TAUS:
        p = dict(base, objective="quantile", alpha=t, metric="quantile")
        ms[t] = lgb.train(p, lgb.Dataset(Xtr, ytr), n_max, valid_sets=[lgb.Dataset(Xca, yca)],
                          callbacks=[lgb.early_stopping(30, verbose=False)])
    return ms


def loss(ms, X, y):
    return {t: float(boosted.pin(y, np.maximum(m.predict(X, num_iteration=m.best_iteration), 0), t).mean())
            for t, m in ms.items()}


def run(df, test_year, seeds, repeats, drop_one=True):
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    Xtr, Xca, Xte = boosted.featurise(tr, [ca, te])
    ytr, yca, yte = tr.y.to_numpy(float), ca.y.to_numpy(float), te.y.to_numpy(float)
    feats = list(Xtr.columns)
    base = harness.ReferenceClass([dict(type=t, y=y) for t, y in zip(tr.permit_type, tr.y)])
    bl = float(np.mean([boosted.pin(yte, np.array([base.predict(k)[t] for k in te.permit_type]), t).mean()
                        for t in TAUS]))
    perm = {f: [] for f in feats}; drop = {f: [] for f in feats}; full = []
    for s in range(seeds):
        ms = fit_models(Xtr, ytr, Xca, yca, s)
        l0 = np.mean(list(loss(ms, Xte, yte).values())); full.append(float(l0))
        rng = np.random.default_rng(1000 + s)
        for f in feats:
            rises = []
            for _ in range(repeats):
                Xp = Xte.copy()
                Xp[f] = Xp[f].to_numpy()[rng.permutation(len(Xp))] if not isinstance(Xp[f].dtype, pd.CategoricalDtype) \
                    else Xp[f].iloc[rng.permutation(len(Xp))].reset_index(drop=True).set_axis(Xp.index)
                rises.append(np.mean(list(loss(ms, Xp, yte).values())) - l0)
            perm[f].append(float(np.mean(rises)))
        if drop_one and s == 0:  # refits are costly: drop-one uses the first seed only
            for f in feats:
                keep = [c for c in feats if c != f]
                m2 = fit_models(Xtr[keep], ytr, Xca[keep], yca, s)
                drop[f].append(float(np.mean(list(loss(m2, Xte[keep], yte).values())) - l0))
    # mean pinball over the three quantiles; mean importance per feature over seeds
    imp = {f: float(np.mean(v)) for f, v in perm.items()}
    pos = {f: max(v, 0.0) for f, v in imp.items()}
    tot = sum(pos.values())
    order = sorted(feats, key=lambda f: -imp[f])
    cum, k80 = 0.0, None
    for i, f in enumerate(order, 1):
        cum += pos[f] / tot if tot > 0 else 0
        if k80 is None and cum >= 0.8:
            k80 = i
    gain = bl - float(np.mean(full))
    return dict(test_year=test_year, n_train=len(tr), n_test=len(te), seeds=seeds, repeats=repeats,
                features=feats, baseline_mean_pinball=bl, boosted_mean_pinball=float(np.mean(full)),
                gain_over_baseline=gain,
                perm_importance=imp, perm_importance_per_seed=perm,
                perm_importance_sum_over_gain=(sum(imp.values()) / gain if gain > 0 else None),
                share={f: pos[f] / tot if tot > 0 else None for f in feats},
                order=order, k80=k80,
                drop_one={f: float(np.mean(v)) for f, v in drop.items()} if drop_one else None,
                drop_one_per_seed=drop if drop_one else None)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--city", required=True, choices=["chicago", "sf", "austin"])
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--repeats", type=int, default=5)
    ap.add_argument("--no-drop-one", action="store_true")
    a = ap.parse_args()
    df, _ = boosted.load_frame(os.path.join(a.data_dir, f"{a.city}.csv"), a.target)
    r = run(df, a.test_year, a.seeds, a.repeats, not a.no_drop_one)
    r.update(city=a.city, target=a.target)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"importance_{a.city}_{a.target}_{a.test_year}.json")
    json.dump(r, open(out, "w"), indent=1)
    print(json.dumps({k: v for k, v in r.items() if "per_seed" not in k}, indent=1))

"""Milestone 7c: refit a quantile model on permit type x cost bucket only, then read it off as a table (H7).

Session 50 (H6) flattened the full boosted model by taking the median of its predictions per cell and kept
little of the gain. Here the model itself sees only the two table keys, so its prediction is constant within
a cell and the table is the model, with no flattening step. Same harness split as prior_boosted.py
(train <= Y-2, early stopping on Y-1, test Y). Compared with the per-type baseline, the empirical
type x bucket lookup (train + calibration rows) and the full boosted model.
  python3 src/prior_refit.py DATA_DIR --test-year 2024 [--seeds 2] [--cities chicago sf]
"""
import argparse, json, os, sys
import numpy as np, pandas as pd, lightgbm as lgb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, harness, prior_boosted as pb  # noqa: E402

TAUS = harness.TAUS


def keys_frame(d, levels):
    x = pd.DataFrame({"permit_type": pd.Categorical(d.permit_type, categories=levels),
                      "bk": d.bk.to_numpy()})
    return x


def fit_keys(Xtr, ytr, Xca, yca, Xq, seed, n_max=300):
    base = dict(learning_rate=0.15, num_leaves=31, min_data_in_leaf=30, seed=seed, verbose=-1,
                num_threads=4, cat_smooth=10, min_data_per_group=30)
    out = {}
    for t in TAUS:
        p = dict(base, objective="quantile", alpha=t, metric="quantile")
        m = lgb.train(p, lgb.Dataset(Xtr, ytr, categorical_feature=["permit_type"]), n_max,
                      valid_sets=[lgb.Dataset(Xca, yca, categorical_feature=["permit_type"])],
                      callbacks=[lgb.early_stopping(30, verbose=False)])
        out[t] = np.maximum(m.predict(Xq, num_iteration=m.best_iteration), 0)
    return out


def run(df, test_year, seeds):
    df = df.assign(bk=pb.bucket(df.log_cost.to_numpy()))
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    levels = sorted(tr.permit_type.unique())
    Xtr, Xca, Xte = (keys_frame(d, levels) for d in (tr, ca, te))
    ytr, yca, yte = (d.y.to_numpy(float) for d in (tr, ca, te))
    P = {t: np.mean([fit_keys(Xtr, ytr, Xca, yca, Xte, s)[t] for s in range(seeds)], axis=0) for t in TAUS}
    # full boosted model for the reference gain
    Xt, Xc, Xe = boosted.featurise(tr, [ca, te])
    F = {t: [] for t in TAUS}
    for s in range(seeds):
        pr, _, _, _ = boosted.fit_predict(Xt, ytr, Xc, yca, Xe, seed=s)
        for t in TAUS:
            F[t].append(pr[t])
    F = {t: np.mean(v, axis=0) for t, v in F.items()}
    base = harness.ReferenceClass([dict(type=a, y=b) for a, b in zip(tr.permit_type, tr.y)])
    bq = {t: np.array([base.predict(k)[t] for k in te.permit_type]) for t in TAUS}
    tc = pd.concat([tr, ca])
    emp_cell = {k: {t: float(v.quantile(t)) for t in TAUS} for k, v in tc.groupby([tc.permit_type, tc.bk]).y
                if len(v) >= pb.MIN_N}
    emp_type = {k: {t: float(v.quantile(t)) for t in TAUS} for k, v in tc.groupby("permit_type").y
                if len(v) >= pb.MIN_N}
    emp_glob = {t: float(tc.y.quantile(t)) for t in TAUS}
    emp = {t: np.array([pb.lookup(emp_cell, emp_type, emp_glob, a, b)[t]
                        for a, b in zip(te.permit_type, te.bk)]) for t in TAUS}
    res = dict(test_year=test_year, n_train=len(tr), n_calib=len(ca), n_test=len(te), seeds=seeds,
               pinball={}, share_of_full_gain={}, share_of_emp_gain={})
    for t in TAUS:
        r = dict(baseline=pb.pin(yte, bq[t], t), empirical_grid=pb.pin(yte, emp[t], t),
                 refit_grid=pb.pin(yte, P[t], t), boosted_full=pb.pin(yte, F[t], t))
        res["pinball"][str(t)] = r
        gf = r["baseline"] - r["boosted_full"]
        res["share_of_full_gain"][str(t)] = (r["baseline"] - r["refit_grid"]) / gf if gf > 0 else None
        ge = r["baseline"] - r["empirical_grid"]
        res["share_of_emp_gain"][str(t)] = (r["baseline"] - r["refit_grid"]) / ge if ge > 0 else None
    sh = [v for v in res["share_of_full_gain"].values() if v is not None]
    res["mean_share_of_full_gain"] = float(np.mean(sh))
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--cities", nargs="*", default=list(pb.FILES))
    a = ap.parse_args()
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    out = []
    for city in a.cities:
        for tg in pb.FILES[city]:
            df, _ = boosted.load_frame(os.path.join(a.data_dir, f"{city}.csv"), tg)
            r = run(df, a.test_year, a.seeds)
            r.update(city=city, target=tg)
            out.append(r)
            print(city, tg, round(r["mean_share_of_full_gain"], 3),
                  {k: None if v is None else round(v, 2) for k, v in r["share_of_full_gain"].items()}, flush=True)
    json.dump(out, open(os.path.join(here, f"prior_refit_eval_{a.test_year}.json"), "w"), indent=1)

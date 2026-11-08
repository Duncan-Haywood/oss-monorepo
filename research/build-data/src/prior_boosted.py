"""Milestone 7b: a model-based permit-duration prior as a lookup table (H6).

The empirical prior (prior.py) is per city, target and permit type. This adds a cost
bucket and smooths each cell with the boosted quantile model (boosted.py): the cell value
is the median of the model's q10/q50/q90 predictions over the calibration-year permits in
that cell, so the shipped artefact is a small table anyone can read, not a model file.
Cells with fewer than MIN_N calibration rows fall back to the type, then the city.

Evaluated forward in time with the harness split (train <= Y-2, calibration Y-1, test Y) against
(a) the harness per-type baseline, (b) an empirical type x cost-bucket lookup built on the same
train + calibration rows, and (c) the full boosted model. Needs pandas, numpy, lightgbm.
  python3 src/prior_boosted.py DATA_DIR --test-year 2024 [--seeds 2] [--publish]
"""
import argparse, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, harness  # noqa: E402

TAUS = harness.TAUS
MIN_N = 30
FILES = {"chicago": ("a2i",), "sf": ("a2i", "i2c"), "austin": ("a2i", "i2c")}
EDGES = [1e3, 1e4, 1e5, 1e6]            # dollars; bucket 0 = cost missing or 0
LABELS = ["unknown", "<1k", "1k-10k", "10k-100k", "100k-1M", ">=1M"]


def bucket(log_cost):
    """Cost bucket index from log1p(cost); missing or zero cost is bucket 0."""
    c = np.round(np.expm1(np.asarray(log_cost, float)), 4)   # undo log1p float noise at exact edges
    b = 1 + np.searchsorted(EDGES, np.nan_to_num(c, nan=0.0), side="right")
    b = np.where(np.isnan(log_cost) | (c <= 0), 0, b)
    return b.astype(int)


def table(keys, preds, min_n=MIN_N):
    """{key: {tau: value}} from the median of preds[tau] over rows sharing a key, n >= min_n."""
    df = pd.DataFrame({"k": keys, **{t: preds[t] for t in TAUS}})
    out = {}
    for k, g in df.groupby("k"):
        if len(g) >= min_n:
            out[k] = {t: float(g[t].median()) for t in TAUS} | {"n": int(len(g))}
    return out


def lookup(tab_cell, tab_type, glob, typ, b):
    return tab_cell.get((typ, b)) or tab_type.get(typ) or glob


def pin(y, q, t):
    return float(boosted.pin(y, q, t).mean())


def run(df, test_year, seeds):
    df = df.assign(bk=bucket(df.log_cost.to_numpy()))
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    Xtr, Xca, Xte = boosted.featurise(tr, [ca, te])
    ytr, yca, yte = (d.y.to_numpy(float) for d in (tr, ca, te))
    # models; predictions on calibration (to build the grid) and test (full boosted)
    Pca = {t: [] for t in TAUS}; Pte = {t: [] for t in TAUS}
    for s in range(seeds):
        pr_te, _, rd, _ = boosted.fit_predict(Xtr, ytr, Xca, yca, Xte, seed=s)
        pr_ca, _, _, _ = boosted.fit_predict(Xtr, ytr, Xca, yca, Xca, seed=s)
        for t in TAUS:
            Pca[t].append(pr_ca[t]); Pte[t].append(pr_te[t])
    Pca = {t: np.mean(v, axis=0) for t, v in Pca.items()}
    Pte = {t: np.mean(v, axis=0) for t, v in Pte.items()}
    glob = {t: float(np.median(Pca[t])) for t in TAUS}
    tab_cell = table(list(zip(ca.permit_type, ca.bk)), Pca)
    tab_type = table(list(ca.permit_type), Pca)
    base = harness.ReferenceClass([dict(type=a, y=b) for a, b in zip(tr.permit_type, tr.y)])
    # empirical type x bucket lookup on train + calibration rows
    tc = pd.concat([tr, ca])
    g = tc.groupby([tc.permit_type, tc.bk]).y
    emp_cell = {k: {t: float(v.quantile(t)) for t in TAUS} for k, v in g if len(v) >= MIN_N}
    emp_type = {k: {t: float(v.quantile(t)) for t in TAUS} for k, v in tc.groupby("permit_type").y if len(v) >= MIN_N}
    emp_glob = {t: float(tc.y.quantile(t)) for t in TAUS}
    rows = list(zip(te.permit_type, te.bk))
    grid = {t: np.array([lookup(tab_cell, tab_type, glob, a, b)[t] for a, b in rows]) for t in TAUS}
    emp = {t: np.array([lookup(emp_cell, emp_type, emp_glob, a, b)[t] for a, b in rows]) for t in TAUS}
    bq = {t: np.array([base.predict(k)[t] for k in te.permit_type]) for t in TAUS}
    res = dict(test_year=test_year, n_train=len(tr), n_calib=len(ca), n_test=len(te), seeds=seeds,
               grid_cells=len(tab_cell), grid_types=len(tab_type), pinball={}, retained={})
    for t in TAUS:
        r = dict(baseline=pin(yte, bq[t], t), empirical_grid=pin(yte, emp[t], t),
                 boosted_grid=pin(yte, grid[t], t), boosted_full=pin(yte, Pte[t], t))
        res["pinball"][str(t)] = r
        gain_full = r["baseline"] - r["boosted_full"]
        res["retained"][str(t)] = dict(
            grid_rel=(r["baseline"] - r["boosted_grid"]) / r["baseline"],
            full_rel=gain_full / r["baseline"],
            emp_grid_rel=(r["baseline"] - r["empirical_grid"]) / r["baseline"],
            share_of_full_gain=(r["baseline"] - r["boosted_grid"]) / gain_full if gain_full > 0 else None)
    res["mean_share_of_full_gain"] = float(np.mean([v["share_of_full_gain"] for v in res["retained"].values()
                                                    if v["share_of_full_gain"] is not None]))
    res["_table"] = dict(cells=tab_cell, types=tab_type, glob=glob)
    return res


def jsonable_table(t):
    cells = [dict(permit_type=k[0], cost=LABELS[k[1]], **{f"q{int(x*100)}": round(v[x], 1) for x in TAUS}, n=v["n"])
             for k, v in sorted(t["cells"].items())]
    types = [dict(permit_type=k, **{f"q{int(x*100)}": round(v[x], 1) for x in TAUS}, n=v["n"])
             for k, v in sorted(t["types"].items())]
    return dict(cells=cells, types=types, all_types={f"q{int(x*100)}": round(t["glob"][x], 1) for x in TAUS})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--publish", action="store_true")
    a = ap.parse_args()
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    summary, pub = [], []
    for city, targets in FILES.items():
        for tg in targets:
            df, neg = boosted.load_frame(os.path.join(a.data_dir, f"{city}.csv"), tg)
            r = run(df, a.test_year, a.seeds)
            tab = r.pop("_table")
            r.update(city=city, target=tg)
            summary.append(r)
            pub.append(dict(city=city, target=tg, calibration_year=a.test_year - 1, **jsonable_table(tab)))
            print(city, tg, round(r["mean_share_of_full_gain"], 3), flush=True)
    json.dump(summary, open(os.path.join(here, f"prior_boosted_eval_{a.test_year}.json"), "w"), indent=1)
    if a.publish:
        json.dump(dict(note="median of boosted q10/q50/q90 predictions per permit type x cost bucket over the "
                            "calibration year; days; see paper 4.7a", cells=pub),
                  open(os.path.join(here, "permit_prior_boosted.json"), "w"), indent=1)

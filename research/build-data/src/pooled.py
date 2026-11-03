"""Milestone 7: pooled model plus a small local sample (H5).

Needs pandas, numpy, scipy, lightgbm. Run:
  python3 src/pooled.py DATA_DIR --target a2i --test-year 2024 [--seeds 2] [--held sf]

H5 (LOG.md, session 11): how many rows of its own history does a new city need before a model
pooled with the other cities (plus those rows) matches the city's full-history per-type
baseline? Per held-out city and local sample size n (rows drawn at random from the city's years
<= Y-2), four predictors are scored on the city's test year Y by pinball loss at q0.1/0.5/0.9:
  base_n         per-type empirical quantiles from the n local rows (the reference-class forecast
                 a city with only n rows could make)
  local_n        LightGBM on the n local rows alone, harmonised features
  pooled_n(w)    LightGBM on the other cities' years <= Y-2 plus the n local rows (weight w), with
                 a city feature; w = 1 and w = 20
  full_base      per-type baseline from ALL the city's years <= Y-2 (the target to match)
n = 0 is the plain transfer model of milestone 6 (plus a city feature that is constant at test).
Early stopping uses the other cities' year Y-1 plus a random 20% of the n local rows (kept out of
training); the held-out city's year Y-1 is never used, so n counts every local row the model sees.
Paired week-block bootstrap on the test year.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd, lightgbm as lgb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness, boosted, transfer  # noqa: E402

TAUS = harness.TAUS
GRID = [0, 100, 300, 1000, 3000, 10000]
WEIGHTS = [1.0, 20.0]


def feats(d, cities):
    x = transfer.feats(d)
    x["city"] = pd.Categorical(d["city"], categories=cities)
    return x


def fit_quantiles(Xtr, ytr, wtr, Xva, yva, Xte, seed, min_leaf, n_max=300):
    base = dict(learning_rate=0.15, num_leaves=63, min_data_in_leaf=min_leaf, feature_fraction=0.8,
                bagging_fraction=0.8, bagging_freq=1, seed=seed, verbose=-1, num_threads=4)
    out = {}
    for t in TAUS:
        p = dict(base, objective="quantile", alpha=t, metric="quantile")
        m = lgb.train(p, lgb.Dataset(Xtr, ytr, weight=wtr), n_max, valid_sets=[lgb.Dataset(Xva, yva)],
                      callbacks=[lgb.early_stopping(30, verbose=False)])
        out[t] = np.maximum(m.predict(Xte, num_iteration=m.best_iteration), 0)
    return out


def run(frames, held, test_year, seeds, grid=GRID, weights=WEIGHTS, cap=200000):
    cities = [c for c in transfer.CITIES if c in frames]
    for c in cities:
        frames[c]["city"] = c
    src = [c for c in cities if c != held]
    def capped(d):  # random subsample per source city: the 4-core session cannot fit 2M+ rows 100 times
        return d.sample(n=cap, random_state=0) if cap and len(d) > cap else d
    s_tr = pd.concat([capped(frames[c][frames[c].year <= test_year - 2]) for c in src])
    s_ca = pd.concat([capped(frames[c][frames[c].year == test_year - 1]) for c in src])
    own = frames[held]
    otr, te = own[own.year <= test_year - 2].reset_index(drop=True), own[own.year == test_year]
    if not all(len(d) for d in (s_tr, s_ca, otr, te)):
        raise SystemExit("empty split")
    yte = te.y.to_numpy(float)
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])

    def base_pred(rows):
        b = harness.ReferenceClass([dict(type=t, y=y) for t, y in zip(rows.permit_type, rows.y)])
        cache = {}
        def one(k):
            if k not in cache:
                cache[k] = b.predict(k)
            return cache[k]
        return {t: np.array([one(k)[t] for k in te.permit_type]) for t in TAUS}

    def loss(p):  # per-row mean of the three pinball losses
        return np.mean([boosted.pin(yte, p[t], t) for t in TAUS], axis=0)

    full = base_pred(otr)
    L_full = loss(full)
    res = dict(held_out=held, test_year=test_year, sources=src, n_test=len(te), n_own_history=len(otr),
               n_source_train=len(s_tr), source_cap_per_city=cap, seeds=seeds, grid=grid, weights=weights,
               full_base=dict(per_tau={str(t): float(boosted.pin(yte, full[t], t).mean()) for t in TAUS},
                              mean3=float(L_full.mean())), rows=[])
    Xs_tr, Xs_ca, Xte = feats(s_tr, cities), feats(s_ca, cities), feats(te, cities)
    for n in grid:
        if n > len(otr):
            continue
        row = dict(n=n)
        losses = {}
        # base_n: seeds only change which rows are drawn
        draws = [otr.sample(n=n, random_state=s) if n else None for s in range(seeds)]
        if n:
            lb = []
            for d in draws:
                lb.append(loss(base_pred(d)))
            losses["base_n"] = np.mean(lb, axis=0)
        for name in (["local_n"] if n else []) + ["pooled_w%g" % w for w in weights]:
            per = []
            for s in range(seeds):
                d = draws[s]
                if n:
                    perm = np.random.default_rng(s).permutation(n)
                    k = max(1, int(0.2 * n))
                    va, lo = d.iloc[perm[:k]], d.iloc[perm[k:]]
                else:
                    lo = va = None
                if name == "local_n":
                    Xtr, ytr, wtr = feats(lo, cities), lo.y.to_numpy(float), None
                    Xva, yva = feats(va, cities), va.y.to_numpy(float)
                    leaf = int(min(100, max(5, len(lo) // 20)))
                else:
                    w = float(name.split("_w")[1])
                    parts, ws = [s_tr], [np.ones(len(s_tr))]
                    vparts = [s_ca]
                    if n:
                        parts.append(lo); ws.append(np.full(len(lo), w)); vparts.append(va)
                    tr_all, va_all = pd.concat(parts), pd.concat(vparts)
                    Xtr, ytr, wtr = feats(tr_all, cities), tr_all.y.to_numpy(float), np.concatenate(ws)
                    Xva, yva = feats(va_all, cities), va_all.y.to_numpy(float)
                    leaf = 100
                per.append(loss(fit_quantiles(Xtr, ytr, wtr, Xva, yva, Xte, s, leaf)))
            losses[name] = np.mean(per, axis=0)
        for name, L in losses.items():
            dfull = L - L_full
            m, lo_, hi_ = boosted.block_boot(dfull, wk)
            r = dict(mean3=float(L.mean()), vs_full=dict(diff=m, lo=lo_, hi=hi_, rel=m / float(L_full.mean())))
            if name != "base_n" and "base_n" in losses:
                m2, l2, h2 = boosted.block_boot(L - losses["base_n"], wk)
                r["vs_base_n"] = dict(diff=m2, lo=l2, hi=h2, rel=m2 / float(losses["base_n"].mean()))
            row[name] = r
        res["rows"].append(row)
        print(held, n, {k: round(v["mean3"], 3) for k, v in row.items() if k != "n"}, flush=True)
    res["crossing"] = crossing(res)
    return res


def crossing(res):
    """Smallest n whose model matches the full-history baseline (point estimate of mean-3 loss at or
    below it), and the smallest n at which the interval vs full baseline lies wholly below zero."""
    out = {}
    names = sorted({k for r in res["rows"] for k in r if k not in ("n", "base_n")} | {"base_n"})
    for name in names:
        pt = next((r["n"] for r in res["rows"] if name in r and r[name]["vs_full"]["diff"] <= 0), None)
        sig = next((r["n"] for r in res["rows"] if name in r and r[name]["vs_full"]["hi"] < 0), None)
        out[name] = dict(first_n_at_or_below_full=pt, first_n_significantly_below_full=sig)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, default=2024)
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--cap", type=int, default=200000, help="max rows per source city (0 = all)")
    ap.add_argument("--held", nargs="*", default=None)
    ap.add_argument("--grid", nargs="*", type=int, default=None, help="local sample sizes (default GRID)")
    ap.add_argument("--tag", default="", help="suffix for the results file, so a rerun does not overwrite M7")
    a = ap.parse_args()
    cities = [c for c in transfer.CITIES if os.path.exists(os.path.join(a.data_dir, f"{c}.csv"))]
    frames = {c: transfer.frame(os.path.join(a.data_dir, f"{c}.csv"), a.target)[0] for c in cities}
    if a.target == "i2c":
        frames = {c: f for c, f in frames.items() if c != "chicago"}
    for held in (a.held or list(frames)):
        r = run(frames, held, a.test_year, a.seeds, grid=a.grid or GRID, cap=a.cap)
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                           f"pooled{a.tag}_{held}_{a.target}_{a.test_year}.json")
        json.dump(r, open(out, "w"), indent=1)
        print(held, a.target, json.dumps(r["crossing"]), flush=True)

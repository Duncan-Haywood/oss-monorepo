"""Milestone 3: boosted quantile models against the reference-class baseline (H1).

Needs pandas, numpy, scipy, lightgbm. Run:
  python3 src/boosted.py DATA_DIR --city sf --target a2i --test-year 2024 [--seeds 5]

Split and quantile definition are the harness's (train <= Y-2, calibration Y-1, test Y).
The calibration year picks the number of trees (early stopping) and nothing else; the
test year is touched once. Features carry no calendar year, so a model cannot lean on a
level it will never see again: permit type, work class, log cost (missing stays missing),
area (top 60 areas in training, rest pooled), description length, month, weekday of the
start date. Targets are days (a2i: applied to issued; i2c: issued to completed).
Also fits a LightGBM classifier for P(same day) so the two-part score is a real Brier.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd, lightgbm as lgb
from scipy.stats import wilcoxon

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness  # noqa: E402

TAUS = harness.TAUS
CATS = ["permit_type", "work_class", "area"]


def load_frame(path, target):
    a, b = ("applied", "issued") if target == "a2i" else ("issued", "completed")
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    df = df[(df[a] != "") & (df[b] != "")].copy()
    s, e = pd.to_datetime(df[a], errors="coerce"), pd.to_datetime(df[b], errors="coerce")
    df["y"] = (e - s).dt.days
    neg = int((df["y"] < 0).sum())
    ok = df["y"].notna() & (df["y"] >= 0) & s.notna()
    df, s = df[ok].copy(), s[ok]
    df["start"] = s.dt.strftime("%Y-%m-%d")
    df["year"] = s.dt.year
    df["month"] = s.dt.month
    df["dow"] = s.dt.day_of_week
    df["log_cost"] = np.log1p(pd.to_numeric(df["estimated_cost"], errors="coerce").clip(lower=0))
    df["desc_len"] = pd.to_numeric(df["description_len"], errors="coerce")
    return df.reset_index(drop=True), neg


def featurise(tr, others):
    top = set(tr["area"].value_counts().head(60).index)
    levels = {c: sorted(tr[c].unique()) for c in ("permit_type", "work_class")}
    out = []
    for d in [tr] + others:
        x = d[["log_cost", "desc_len", "month", "dow"]].copy()
        for c in CATS:
            v = d[c] if c != "area" else d[c].where(d[c].isin(top), "other")
            lv = levels.get(c, sorted(top | {"other"}))
            x[c] = pd.Categorical(v, categories=lv)
        out.append(x)
    return out


def fit_predict(Xtr, ytr, Xca, yca, Xte, seed, n_max=300):
    base = dict(learning_rate=0.15, num_leaves=63, min_data_in_leaf=100, feature_fraction=0.8,
                bagging_fraction=0.8, bagging_freq=1, seed=seed, verbose=-1, num_threads=4)
    preds, rounds = {}, {}
    for t in TAUS:
        p = dict(base, objective="quantile", alpha=t, metric="quantile")
        m = lgb.train(p, lgb.Dataset(Xtr, ytr), n_max, valid_sets=[lgb.Dataset(Xca, yca)],
                      callbacks=[lgb.early_stopping(30, verbose=False)])
        preds[t] = np.maximum(m.predict(Xte, num_iteration=m.best_iteration), 0)
        rounds[t] = m.best_iteration
    p = dict(base, objective="binary", metric="binary_logloss")
    c = lgb.train(p, lgb.Dataset(Xtr, (ytr == 0).astype(int)), n_max,
                  valid_sets=[lgb.Dataset(Xca, (yca == 0).astype(int))],
                  callbacks=[lgb.early_stopping(30, verbose=False)])
    pz = c.predict(Xte, num_iteration=c.best_iteration)
    return preds, pz, rounds, c.best_iteration


def pin(y, q, t):
    d = y - q
    return np.where(d >= 0, t * d, (t - 1) * d)


def block_boot(diff, weeks, n_boot=2000, seed=0):
    """Paired week-block bootstrap of mean(diff); same scheme as harness.week_block_bootstrap."""
    codes, uniq = pd.factorize(weeks)
    sums = np.bincount(codes, weights=diff, minlength=len(uniq))
    cnt = np.bincount(codes, minlength=len(uniq)).astype(float)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(uniq), size=(n_boot, len(uniq)))
    stat = np.sort(sums[idx].sum(1) / cnt[idx].sum(1))
    return float(diff.mean()), float(stat[int(.025 * n_boot)]), float(stat[int(.975 * n_boot) - 1])


def run(df, test_year, seeds, neg=0):
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    if not (len(tr) and len(ca) and len(te)):
        raise SystemExit(f"empty split {len(tr)}/{len(ca)}/{len(te)}")
    Xtr, Xca, Xte = featurise(tr, [ca, te])
    ytr, yca, yte = tr.y.to_numpy(float), ca.y.to_numpy(float), te.y.to_numpy(float)
    base = harness.ReferenceClass([dict(type=t, y=y) for t, y in zip(tr.permit_type, tr.y)])
    bq = {t: np.array([base.predict(k)[t] for k in te.permit_type]) for t in TAUS}
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    res = dict(test_year=test_year, n_train=len(tr), n_calib=len(ca), n_test=len(te),
               negative_dropped=neg, seeds=seeds, learning_rate=0.15, max_rounds=300, features=list(Xtr.columns))
    P = {t: [] for t in TAUS}; PZ = []; R = []
    for s in range(seeds):
        pr, pz, rd, rz = fit_predict(Xtr, ytr, Xca, yca, Xte, seed=s)
        for t in TAUS:
            P[t].append(pr[t])
        PZ.append(pz); R.append(dict(rd, binary=rz))
    res["rounds"] = R
    res["baseline_pinball"] = {str(t): float(pin(yte, bq[t], t).mean()) for t in TAUS}
    res["boosted_pinball_per_seed"] = {str(t): [float(pin(yte, p, t).mean()) for p in P[t]] for t in TAUS}
    res["boosted_pinball"] = {str(t): float(np.mean(v)) for t, v in
                              ((t, res["boosted_pinball_per_seed"][str(t)]) for t in TAUS)}
    res["h1"] = {}
    for t in TAUS:
        # seed-averaged prediction is not used: each seed is a separate model; the mean of the
        # per-row losses over seeds is what the paired bootstrap sees
        lb = np.mean([pin(yte, p, t) for p in P[t]], axis=0)
        d = lb - pin(yte, bq[t], t)           # negative = boosted better
        m, lo, hi = block_boot(d, wk)
        wkdf = pd.DataFrame({"w": wk, "d": d}).groupby("w").d.mean()
        try:
            pw = float(wilcoxon(wkdf.to_numpy()).pvalue)
        except ValueError:
            pw = None
        res["h1"][str(t)] = dict(diff=m, lo=lo, hi=hi, rel=m / res["baseline_pinball"][str(t)],
                                 wilcoxon_p_weekly=pw, n_weeks=len(wkdf))
    # coverage of the model's own q0.1..q0.9 interval (before any conformal step)
    cov = [float(np.mean((P[.1][s] <= yte) & (yte <= P[.9][s]))) for s in range(seeds)]
    res["coverage_80_per_seed"] = cov
    res["coverage_80"] = float(np.mean(cov))
    z = (yte == 0).astype(float)
    res["share_same_day_test"] = float(z.mean())
    res["brier_same_day_boosted"] = float(np.mean([np.mean((pz - z) ** 2) for pz in PZ]))
    # the harness's baseline same-day probability: largest tau with q<=0
    pzb = np.array([max([t for t in TAUS if base.predict(k)[t] <= 0], default=0.0) for k in te.permit_type])
    res["brier_same_day_baseline"] = float(np.mean((pzb - z) ** 2))
    res["brier_same_day_constant_train_rate"] = float(np.mean((float((ytr == 0).mean()) - z) ** 2))
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--city", required=True, choices=["chicago", "sf", "austin"])
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=5)
    a = ap.parse_args()
    df, neg = load_frame(os.path.join(a.data_dir, f"{a.city}.csv"), a.target)
    r = run(df, a.test_year, a.seeds, neg)
    r.update(city=a.city, target=a.target)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"boosted_{a.city}_{a.target}_{a.test_year}.json")
    json.dump(r, open(out, "w"), indent=1)
    print(json.dumps({k: v for k, v in r.items() if k not in ("rounds", "boosted_pinball_per_seed")}, indent=1))

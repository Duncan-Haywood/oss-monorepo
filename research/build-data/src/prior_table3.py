"""Milestone 7e: does an empirical type x work class x cost-bucket table keep the boosted gain? (H9)

Session 52's ladder (prior_ladder.py) found that type + log cost + work class keeps >= 50% of the
full LightGBM model's pinball gain over the per-type baseline in 5 of 5 sets, as refit models on a
continuous cost. This builds the readable version: an empirical quantile table on type x work class
x cost bucket (cells under MIN_N rows back off to type x work class, then type, then the city),
built on train + calibration rows, and scores it on the test year against the same baseline and the
full model. Needs pandas, numpy, lightgbm.
  python3 src/prior_table3.py DATA_DIR --test-year 2024 [--seeds 2]
"""
import argparse, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, harness  # noqa: E402
from prior_boosted import bucket, pin  # noqa: E402

TAUS = harness.TAUS
MIN_N = 30
FILES = {"chicago": ("a2i",), "sf": ("a2i", "i2c"), "austin": ("a2i", "i2c"), "seattle": ("a2i", "i2c")}


def build(df, keycols, min_n=MIN_N):
    """{key tuple: {tau: empirical quantile}} for groups with at least min_n rows."""
    out = {}
    for k, g in df.groupby(keycols, observed=True):
        if len(g) >= min_n:
            out[k if isinstance(k, tuple) else (k,)] = {t: float(g.y.quantile(t)) for t in TAUS}
    return out


def predict(tabs, glob, rows):
    """Back off through tabs (finest first); each tab is (key-extractor, table). Returns {tau: array}, level counts."""
    P = {t: np.empty(len(rows)) for t in TAUS}
    lv = np.zeros(len(tabs) + 1, int)
    for i, r in enumerate(rows):
        for j, (ex, tab) in enumerate(tabs):
            c = tab.get(ex(r))
            if c is not None:
                lv[j] += 1
                break
        else:
            c = glob; lv[-1] += 1
        for t in TAUS:
            P[t][i] = c[t]
    return P, lv.tolist()


def run(df, test_year, seeds):
    df = df.assign(bk=bucket(df.log_cost.to_numpy()), wc=df.work_class.fillna("na").astype(str))
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    Xtr, Xca, Xte = boosted.featurise(tr, [ca, te])
    ytr, yca, yte = (d.y.to_numpy(float) for d in (tr, ca, te))
    full = {t: [] for t in TAUS}
    for s in range(seeds):
        pr, _, _, _ = boosted.fit_predict(Xtr, ytr, Xca, yca, Xte, seed=s)
        for t in TAUS:
            full[t].append(pr[t])
    full = {t: np.mean(v, axis=0) for t, v in full.items()}
    base = harness.ReferenceClass([dict(type=a, y=b) for a, b in zip(tr.permit_type, tr.y)])
    bq = {t: np.array([base.predict(k)[t] for k in te.permit_type]) for t in TAUS}
    tc = pd.concat([tr, ca])
    glob = {t: float(tc.y.quantile(t)) for t in TAUS}
    cols = {"type": ["permit_type"], "type+bk": ["permit_type", "bk"], "type+wc": ["permit_type", "wc"],
            "type+wc+bk": ["permit_type", "wc", "bk"]}
    T = {n: build(tc, c) for n, c in cols.items()}
    rows = list(zip(te.permit_type, te.wc, te.bk))
    ex = {"type": lambda r: (r[0],), "type+bk": lambda r: (r[0], r[2]), "type+wc": lambda r: (r[0], r[1]),
          "type+wc+bk": lambda r: r}
    chains = {"type+bk": ["type+bk", "type"], "type+wc": ["type+wc", "type"],
              "type+wc+bk": ["type+wc+bk", "type+wc", "type"]}
    res = dict(test_year=test_year, n_test=len(te), seeds=seeds, cells={n: len(T[n]) for n in T}, pinball={}, share={}, levels={})
    preds = {}
    for name, ch in chains.items():
        preds[name], res["levels"][name] = predict([(ex[c], T[c]) for c in ch], glob, rows)
    for name, P in list(preds.items()) + [("baseline", bq), ("full", full)]:
        res["pinball"][name] = {str(t): pin(yte, P[t], t) for t in TAUS}
    for name in preds:
        sh = []
        for t in TAUS:
            b, f = res["pinball"]["baseline"][str(t)], res["pinball"]["full"][str(t)]
            sh.append((b - res["pinball"][name][str(t)]) / (b - f) if b - f > 0 else None)
        res["share"][name] = dict(per_tau=[None if x is None else float(x) for x in sh],
                                  mean=float(np.mean([x for x in sh if x is not None])) if any(x is not None for x in sh) else None)
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
            p = os.path.join(a.data_dir, f"{city}.csv")
            if not os.path.exists(p):
                print("skip", city, "no data"); continue
            df, _ = boosted.load_frame(p, tg)
            r = run(df, a.test_year, a.seeds); r.update(city=city, target=tg); out.append(r)
            print(city, tg, {k: None if v["mean"] is None else round(v["mean"], 2) for k, v in r["share"].items()}, flush=True)
    json.dump(out, open(os.path.join(here, f"prior_table3_{a.test_year}.json"), "w"), indent=1)

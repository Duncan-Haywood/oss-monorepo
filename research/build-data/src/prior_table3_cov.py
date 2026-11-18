"""Milestone 7f: conformal coverage of the empirical type x work class x cost-bucket table (H10).

The table is built on train rows (year <= test-2), CQR scores of its [q10, q90] interval come
from the calibration year (test-1), and coverage / mean width are measured on the test year.
Same recipe on the per-type baseline and the full LightGBM model. Needs pandas, numpy, lightgbm.
  python3 src/prior_table3_cov.py DATA_DIR --test-year 2024 [--seeds 2]
"""
import argparse, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, harness, conformal  # noqa: E402
from prior_boosted import bucket  # noqa: E402
from prior_table3 import build, predict, FILES  # noqa: E402

LO, HI, ALPHA = 0.1, 0.9, 0.2


def interval_stats(lo_c, hi_c, y_c, lo_t, hi_t, y_t, seed=0):
    """Plain and dequantised CQR from calibration arrays; coverage and width on the test arrays."""
    lo_c, hi_c, y_c, lo_t, hi_t, y_t = (np.asarray(a, float).tolist() for a in (lo_c, hi_c, y_c, lo_t, hi_t, y_t))
    out = {"raw_coverage": conformal.coverage(lo_t, hi_t, y_t)}
    deq = conformal.cqr_scores_dequantised(lo_c, hi_c, y_c, seed)
    # "dequantised_nonempty" (session 55/56) uses the same scores but keeps a floored lower end
    # in place when qhat < 0, which session 55 traced the coverage collapse to.
    for name, sc, fn in (("plain", conformal.cqr_scores(lo_c, hi_c, y_c), conformal.cqr_interval),
                         ("dequantised", deq, conformal.cqr_interval),
                         ("dequantised_nonempty", deq, conformal.cqr_interval_nonempty)):
        q = conformal.conformal_quantile(sc, ALPHA)
        lo2, hi2 = fn(lo_t, hi_t, q)
        out[name] = dict(qhat=q, coverage=conformal.coverage(lo2, hi2, y_t),
                         width=float(np.mean(np.asarray(hi2) - np.asarray(lo2))))
    return out


def run(df, test_year, seeds):
    df = df.assign(bk=bucket(df.log_cost.to_numpy()), wc=df.work_class.fillna("na").astype(str))
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    Xtr, Xca, Xte = boosted.featurise(tr, [ca, te])
    ytr, yca, yte = (d.y.to_numpy(float) for d in (tr, ca, te))
    Xboth = pd.concat([Xca, Xte])  # one predict call covers calibration and test rows
    nca = len(ca)
    acc = {t: [] for t in (LO, HI)}
    for s in range(seeds):
        pr = boosted.fit_predict(Xtr, ytr, Xca, yca, Xboth, seed=s)[0]
        for t in (LO, HI):
            acc[t].append(pr[t])
    fm = {t: np.mean(v, axis=0) for t, v in acc.items()}
    full_c = {t: fm[t][:nca] for t in fm}
    full_t = {t: fm[t][nca:] for t in fm}
    base = harness.ReferenceClass([dict(type=a, y=b) for a, b in zip(tr.permit_type, tr.y)])
    bq = lambda d: {t: np.array([base.predict(k)[t] for k in d.permit_type]) for t in (LO, HI)}
    glob = {t: float(tr.y.quantile(t)) for t in harness.TAUS}
    cols = {"type": ["permit_type"], "type+wc": ["permit_type", "wc"], "type+wc+bk": ["permit_type", "wc", "bk"]}
    T = {n: build(tr, c) for n, c in cols.items()}
    ex = {"type": lambda r: (r[0],), "type+wc": lambda r: (r[0], r[1]), "type+wc+bk": lambda r: r}
    ch = [(ex[c], T[c]) for c in ("type+wc+bk", "type+wc", "type")]
    rows = lambda d: list(zip(d.permit_type, d.wc, d.bk))
    tab_c, _ = predict(ch, glob, rows(ca))
    tab_t, lv_t = predict(ch, glob, rows(te))
    models = {"table3": (tab_c, tab_t), "baseline": (bq(ca), bq(te)), "full": (full_c, full_t)}
    r = dict(test_year=test_year, n_cal=len(ca), n_test=len(te), seeds=seeds, table_levels_test=lv_t, models={})
    for name, (C, Tt) in models.items():
        r["models"][name] = interval_stats(C[LO], C[HI], yca, Tt[LO], Tt[HI], yte)
    return r


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir"); ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--cities", nargs="*", help="subset of FILES; the output file then gets a city suffix")
    a = ap.parse_args()
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    out = []
    for city, targets in FILES.items():
        if a.cities and city not in a.cities:
            continue
        for tg in targets:
            p = os.path.join(a.data_dir, f"{city}.csv")
            if not os.path.exists(p):
                print("skip", city, "no data"); continue
            df, _ = boosted.load_frame(p, tg)
            r = run(df, a.test_year, a.seeds); r.update(city=city, target=tg); out.append(r)
            print(city, tg, {m: dict(cov_deq=round(v["dequantised"]["coverage"], 3), w_deq=round(v["dequantised"]["width"], 1),
                                     cov_plain=round(v["plain"]["coverage"], 3), w_plain=round(v["plain"]["width"], 1))
                             for m, v in r["models"].items()}, flush=True)
    json.dump(out, open(os.path.join(here, f"prior_table3_cov_{a.test_year}" + ("_" + "_".join(a.cities) if a.cities else "") + ".json"), "w"), indent=1)

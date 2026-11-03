"""Milestone 19 run (H2c): Mondrian (group-conditional) CQR, groups = bands of a LightGBM P(same day).

  python3 src/conformal_mondrian_run.py DATA_DIR --city sf --target a2i --test-year 2024 [--seeds 3]

Same split and models as conformal_run.py (fit <= Y-2; early-stop odd weeks of Y-1; calibrate even weeks
of Y-1; test Y). Bands of the classifier's P(y == 0) use edges 0.33 and 0.67 (pre-registered in LOG.md,
session 20). Intervals are rounded outward (floor lower, ceil upper) because y is integer days.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, conformal, harness  # noqa: E402

boosted.TAUS = (0.1, 0.9)
EDGES = (0.33, 0.67)


def run(df, Y, seeds, neg=0):
    tr, prev, te = df[df.year <= Y - 2], df[df.year == Y - 1], df[df.year == Y]
    wk_prev = np.array([harness.week(s)[1] for s in prev.start])
    es, ca = prev[wk_prev % 2 == 1], prev[wk_prev % 2 == 0]
    Xtr, Xes, Xca, Xte = boosted.featurise(tr, [es, ca, te])
    ytr, yes, yca, yte = (d.y.to_numpy(float) for d in (tr, es, ca, te))
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    ind, ind_pool, widths, qs_all, cov_band = [], [], [], [], []
    n = len(Xca)
    Xct = pd.concat([Xca, Xte], ignore_index=True)
    for s in range(seeds):
        pr, pz, _, _ = boosted.fit_predict(Xtr, ytr, Xes, yes, Xct, seed=s)
        cal = dict(lo=list(pr[.1][:n]), hi=list(pr[.9][:n]), y=list(yca))
        tst = dict(lo=list(pr[.1][n:]), hi=list(pr[.9][n:]), y=list(yte))
        gc, gt = conformal.bands(pz[:n], EDGES), conformal.bands(pz[n:], EDGES)
        lo, hi, qs, pooled = conformal.mondrian_cqr(cal, tst, gc, gt, 0.2)
        lo, hi = np.floor(lo), np.ceil(hi)
        ind.append(((lo <= yte) & (yte <= hi)).astype(float))
        lo_p, hi_p = conformal.cqr_interval(tst["lo"], tst["hi"], pooled)
        ind_pool.append(((np.floor(lo_p) <= yte) & (yte <= np.ceil(hi_p))).astype(float))
        widths.append(float(np.mean(hi - lo)))
        qs_all.append({str(k): v for k, v in qs.items()} | {"pooled": pooled})
        gt = np.array(gt)
        cov_band.append({str(g): (int((gt == g).sum()), float(ind[-1][gt == g].mean())) for g in sorted(set(gt))})
    out = dict(test_year=Y, n_train=len(tr), n_conformal=len(ca), n_test=len(te), negative_dropped=neg,
               seeds=seeds, alpha=0.2, edges=list(EDGES), qhat_by_band=qs_all, coverage_by_band=cov_band,
               mean_width_mondrian_rounded=float(np.mean(widths)))
    for name, i in (("mondrian_rounded", ind), ("pooled_rounded", ind_pool)):
        m, lo_, hi_ = boosted.block_boot(np.mean(i, 0), wk)
        out["coverage_" + name] = dict(mean=m, lo=lo_, hi=hi_, per_seed=[float(x.mean()) for x in i])
    out["h2c_within_77_83"] = 0.77 <= out["coverage_mondrian_rounded"]["mean"] <= 0.83
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--city", required=True, choices=["chicago", "sf", "austin"])
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=3)
    a = ap.parse_args()
    df, neg = boosted.load_frame(os.path.join(a.data_dir, f"{a.city}.csv"), a.target)
    r = run(df, a.test_year, a.seeds, neg)
    r.update(city=a.city, target=a.target)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"conformal_mondrian_{a.city}_{a.target}_{a.test_year}.json")
    json.dump(r, open(out, "w"), indent=1)
    print(a.city, a.target, "mondrian %.3f pooled %.3f width %.2f within=%s" % (
        r["coverage_mondrian_rounded"]["mean"], r["coverage_pooled_rounded"]["mean"],
        r["mean_width_mondrian_rounded"], r["h2c_within_77_83"]))

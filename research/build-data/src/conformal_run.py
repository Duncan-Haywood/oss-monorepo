"""Milestone 4 run (H2): split-conformal (CQR) intervals around LightGBM q0.1/q0.9 on the real feeds.

  python3 src/conformal_run.py DATA_DIR --city sf --target a2i --test-year 2024 [--seeds 3]

Design (LOG.md, session 7): fit on years <= Y-2; early-stop on the odd ISO weeks of Y-1; conformalise
on the even weeks of Y-1 (so no row does both jobs); apply to Y. Coverage CI: paired week-block
bootstrap of the seed-averaged coverage indicator. Needs pandas, numpy, scipy, lightgbm.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, conformal, harness  # noqa: E402

boosted.TAUS = (0.1, 0.9)  # CQR needs only the two interval ends


def run(df, Y, seeds, neg=0):
    tr = df[df.year <= Y - 2]
    prev = df[df.year == Y - 1]
    te = df[df.year == Y]
    wk_prev = np.array([harness.week(s)[1] for s in prev.start])
    es, ca = prev[wk_prev % 2 == 1], prev[wk_prev % 2 == 0]
    Xtr, Xes, Xca, Xte = boosted.featurise(tr, [es, ca, te])
    ytr, yes, yca, yte = (d.y.to_numpy(float) for d in (tr, es, ca, te))
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    mon = [int(s[5:7]) for s in te.start]
    ev, ind_raw, ind_cf, ks, qh = [], [], [], [], []
    for s in range(seeds):
        # fit_predict predicts one frame; stack calibration and test rows to get both from one fit
        Xct = pd.concat([Xca, Xte], ignore_index=True)
        pr, _, _, _ = boosted.fit_predict(Xtr, ytr, Xes, yes, Xct, seed=s)
        n = len(Xca)
        cal = dict(lo=list(pr[.1][:n]), hi=list(pr[.9][:n]), y=list(yca))
        tst = dict(lo=list(pr[.1][n:]), hi=list(pr[.9][n:]), y=list(yte))
        r = conformal.evaluate(cal, tst, 0.2, months=mon)
        ev.append(r)
        q = r["qhat"]
        lo2, hi2 = conformal.cqr_interval(tst["lo"], tst["hi"], q)
        ind_raw.append(((np.array(tst["lo"]) <= yte) & (yte <= np.array(tst["hi"]))).astype(float))
        ind_cf.append(((np.array(lo2) <= yte) & (yte <= np.array(hi2))).astype(float))
    out = dict(test_year=Y, n_train=len(tr), n_earlystop=len(es), n_conformal=len(ca), n_test=len(te),
               negative_dropped=neg, seeds=seeds, alpha=0.2)
    for name, ind in (("raw", ind_raw), ("conformal", ind_cf)):
        m, lo, hi = boosted.block_boot(np.mean(ind, 0), wk)
        out["coverage_" + name] = dict(mean=m, lo=lo, hi=hi, per_seed=[float(i.mean()) for i in ind])
    for k in ("qhat", "mean_width_raw", "mean_width_conformal", "ks_scores_cal_vs_test"):
        out[k] = float(np.mean([e[k] for e in ev]))
    bm = {}
    for e in ev:
        for m_, (n_, c_) in e["coverage_by_month"].items():
            bm.setdefault(m_, []).append((n_, c_))
    out["coverage_by_month"] = {str(m_): dict(n=v[0][0], coverage=float(np.mean([c for _, c in v]))) for m_, v in sorted(bm.items())}
    out["h2_within_3pts"] = abs(out["coverage_conformal"]["mean"] - 0.8) <= 0.03
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
                       f"conformal_{a.city}_{a.target}_{a.test_year}.json")
    json.dump(r, open(out, "w"), indent=1)
    print(a.city, a.target, a.test_year, "raw %.3f conf %.3f qhat %.2f ks %.3f" % (
        r["coverage_raw"]["mean"], r["coverage_conformal"]["mean"], r["qhat"], r["ks_scores_cal_vs_test"]))

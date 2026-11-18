"""Milestone 21 run (H2e): choose the quantile-level pair (tau_lo, tau_hi) by conformal calibration.

  python3 src/conformal_tau_run.py DATA_DIR --city chicago --target a2i --test-year 2024 [--seeds 3]

Same split and models as conformal_run.py (fit <= Y-2; early-stop odd weeks of Y-1; calibrate even weeks
of Y-1). For every pair on the grid the CQR qhat is taken from the calibration weeks, the interval is
rounded outward (y is integer days), and the pair is scored by mean width on the CALIBRATION rows only
(the test year is never used to pick). Reported: the pair chosen that way, its 2024 coverage and width,
and the full grid for transparency.
"""
import argparse, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, conformal, harness  # noqa: E402
import pandas as pd

LO = (0.05, 0.1, 0.2)
HI = (0.65, 0.7, 0.75, 0.8, 0.85, 0.9)
ALPHA = 0.2
boosted.TAUS = tuple(sorted(set(LO + HI)))


def run(df, Y, seeds, neg=0):
    tr, prev, te = df[df.year <= Y - 2], df[df.year == Y - 1], df[df.year == Y]
    wk_prev = np.array([harness.week(s)[1] for s in prev.start])
    es, ca = prev[wk_prev % 2 == 1], prev[wk_prev % 2 == 0]
    Xtr, Xes, Xca, Xte = boosted.featurise(tr, [es, ca, te])
    ytr, yes, yca, yte = (d.y.to_numpy(float) for d in (tr, es, ca, te))
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    n = len(Xca)
    Xct = pd.concat([Xca, Xte], ignore_index=True)
    grid = {}
    for s in range(seeds):
        pr, _, _, _ = boosted.fit_predict(Xtr, ytr, Xes, yes, Xct, seed=s)
        for lo in LO:
            for hi in HI:
                lc, hc, lt, ht = pr[lo][:n], pr[hi][:n], pr[lo][n:], pr[hi][n:]
                q = conformal.conformal_quantile(list(np.maximum(lc - yca, yca - hc)), ALPHA)
                def cov(l, h, y):
                    l, h = np.floor(np.maximum(0, l - q)), np.ceil(h + q)
                    return ((l <= y) & (y <= h)).astype(float), (h - l)
                ic, wc = cov(lc, hc, yca)
                it, wt = cov(lt, ht, yte)
                g = grid.setdefault("%g_%g" % (lo, hi), dict(lo=lo, hi=hi, q=[], cal_cov=[], cal_w=[], te=[], te_w=[]))
                g["q"].append(float(q)); g["cal_cov"].append(float(ic.mean())); g["cal_w"].append(float(wc.mean()))
                g["te"].append(it); g["te_w"].append(float(wt.mean()))
    out = dict(test_year=Y, n_train=len(tr), n_cal=n, n_test=len(te), negative_dropped=neg, seeds=seeds,
               alpha=ALPHA, grid={})
    for k, g in grid.items():
        m, lo_, hi_ = boosted.block_boot(np.mean(g["te"], 0), wk)
        out["grid"][k] = dict(lo=g["lo"], hi=g["hi"], qhat=float(np.mean(g["q"])),
                              cal_coverage=float(np.mean(g["cal_cov"])), cal_width=float(np.mean(g["cal_w"])),
                              test_coverage=m, test_lo=lo_, test_hi=hi_, test_width=float(np.mean(g["te_w"])))
    ok = {k: v for k, v in out["grid"].items() if v["cal_coverage"] >= 0.78}
    pick = min(ok, key=lambda k: ok[k]["cal_width"])      # chosen on calibration rows only
    out["chosen"] = pick; out["chosen_result"] = out["grid"][pick]
    out["reference_0.1_0.9"] = out["grid"]["0.1_0.9"]
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir"); ap.add_argument("--city", required=True, choices=["chicago", "sf", "austin"])
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, required=True); ap.add_argument("--seeds", type=int, default=3)
    a = ap.parse_args()
    df, neg = boosted.load_frame(os.path.join(a.data_dir, f"{a.city}.csv"), a.target)
    r = run(df, a.test_year, a.seeds, neg); r.update(city=a.city, target=a.target)
    json.dump(r, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
              f"conformal_tau_{a.city}_{a.target}_{a.test_year}.json"), "w"), indent=1)
    for k, v in sorted(r["grid"].items()):
        print(a.city, k, "q=%.2f calcov=%.3f calw=%.1f | test cov=%.3f w=%.1f" % (
            v["qhat"], v["cal_coverage"], v["cal_width"], v["test_coverage"], v["test_width"]))
    print("CHOSEN", r["chosen"], r["chosen_result"]["test_coverage"], r["chosen_result"]["test_width"])

"""Milestone 20 run (H2d): rolling conformal calibration over the test year.

  python3 src/conformal_rolling_run.py DATA_DIR --city chicago --target a2i --test-year 2024 [--seeds 3]

Same models and static split as conformal_run.py (fit <= Y-2; early-stop odd weeks of Y-1; static
calibration = even weeks of Y-1). Rolling: for each test week starting on day t0, the calibration pool
is every row of (even weeks of Y-1) + (test-year rows) whose outcome was already KNOWN before t0
(start + y < t0, so no peeking) and, for window W, known on or after t0 - W days. Fewer than MIN_N
known rows falls back to the static qhat. Intervals are rounded outward (y is integer days).
Also reports a weekly-batch adaptive conformal (Gibbs and Candes 2021, gamma 0.02) on the same stream.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, conformal, harness  # noqa: E402

boosted.TAUS = (0.1, 0.9)
WINDOWS = (60, 120, 365, None)
MIN_N = 200
ALPHA, GAMMA = 0.2, 0.02


def qhat_of(sc, a):
    return conformal.conformal_quantile(list(sc), a)


def run(df, Y, seeds, neg=0):
    tr, prev, te = df[df.year <= Y - 2], df[df.year == Y - 1], df[df.year == Y]
    wk_prev = np.array([harness.week(s)[1] for s in prev.start])
    es, ca = prev[wk_prev % 2 == 1], prev[wk_prev % 2 == 0]
    Xtr, Xes, Xca, Xte = boosted.featurise(tr, [es, ca, te])
    ytr, yes, yca, yte = (d.y.to_numpy(float) for d in (tr, es, ca, te))
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    n = len(Xca)
    Xct = pd.concat([Xca, Xte], ignore_index=True)
    day = lambda d: (pd.to_datetime(d.start) - pd.Timestamp("1970-01-01")).dt.days.to_numpy()
    d_ca, d_te = day(ca), day(te)
    known_ca, known_te = d_ca + yca, d_te + yte          # day the outcome became known
    wkidx = (d_te - d_te.min()) // 7
    res = {str(w): [] for w in WINDOWS}; res["static"] = []; res["aci"] = []; res["raw"] = []
    wid = {k: [] for k in res}
    qtrace = []
    for s in range(seeds):
        pr, _, _, _ = boosted.fit_predict(Xtr, ytr, Xes, yes, Xct, seed=s)
        lo_c, hi_c = pr[.1][:n], pr[.9][:n]
        lo_t, hi_t = pr[.1][n:], pr[.9][n:]
        sc_c = np.maximum(lo_c - yca, yca - hi_c)
        sc_t = np.maximum(lo_t - yte, yte - hi_t)
        q_static = qhat_of(sc_c, ALPHA)
        def cover(lo, hi, rows):
            lo, hi = np.floor(lo), np.ceil(hi)
            return ((lo <= yte[rows]) & (yte[rows] <= hi)).astype(float), float(np.mean(hi - lo))
        ind = {k: np.zeros(len(yte)) for k in res}; w_ = {k: 0.0 for k in res}
        alpha_t = ALPHA; a_trace = []
        for wi in range(int(wkidx.max()) + 1):
            rows = np.where(wkidx == wi)[0]
            if len(rows) == 0:
                continue
            t0 = d_te[rows].min()
            pool_sc = np.concatenate([sc_c, sc_t]); pool_known = np.concatenate([known_ca, known_te])
            for W in WINDOWS:
                m = pool_known < t0
                if W is not None:
                    m &= pool_known >= t0 - W
                q = qhat_of(pool_sc[m], ALPHA) if m.sum() >= MIN_N else q_static
                if not np.isfinite(q): q = q_static
                i, w = cover(lo_t[rows] - q, hi_t[rows] + q, rows)
                lo_, hi_ = np.maximum(0, lo_t[rows] - q), hi_t[rows] + q
                i, w = cover(lo_, hi_, rows); ind[str(W)][rows] = i; w_[str(W)] += w * len(rows)
                if W == 120: qtrace.append((int(wi), float(q)))
            lo_, hi_ = np.maximum(0, lo_t[rows] - q_static), hi_t[rows] + q_static
            i, w = cover(lo_, hi_, rows); ind["static"][rows] = i; w_["static"] += w * len(rows)
            i, w = cover(np.maximum(0, lo_t[rows]), hi_t[rows], rows); ind["raw"][rows] = i; w_["raw"] += w * len(rows)
            # ACI: quantile level 1-alpha_t of the static+known pool, then update on this week's miss rate
            m = pool_known < t0
            aa = min(max(alpha_t, 1e-3), 0.999)
            qa = qhat_of(pool_sc[m], aa) if m.sum() >= MIN_N else q_static
            if not np.isfinite(qa): qa = float(np.max(pool_sc[m])) if m.sum() else q_static
            i, w = cover(np.maximum(0, lo_t[rows] - qa), hi_t[rows] + qa, rows); ind["aci"][rows] = i; w_["aci"] += w * len(rows)
            alpha_t += GAMMA * (ALPHA - (1 - i.mean()))
            a_trace.append(round(alpha_t, 4))
        for k in res:
            res[k].append(ind[k]); wid[k].append(w_[k] / len(yte))
    out = dict(test_year=Y, n_train=len(tr), n_static_cal=n, n_test=len(te), negative_dropped=neg, seeds=seeds,
               alpha=ALPHA, min_n=MIN_N, aci_gamma=GAMMA, windows=[str(w) for w in WINDOWS],
               q_trace_W120=qtrace[:60], aci_alpha_trace_last_seed=a_trace)
    for k in res:
        m, lo_, hi_ = boosted.block_boot(np.mean(res[k], 0), wk)
        out["coverage_" + k] = dict(mean=m, lo=lo_, hi=hi_, per_seed=[float(x.mean()) for x in res[k]],
                                    mean_width=float(np.mean(wid[k])))
    out["h2d_within_77_83"] = {k: 0.77 <= out["coverage_" + k]["mean"] <= 0.83 for k in res}
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
              f"conformal_rolling_{a.city}_{a.target}_{a.test_year}.json"), "w"), indent=1)
    print(a.city, a.target, " ".join("%s=%.3f(w%.2f)" % (k, r["coverage_" + k]["mean"], r["coverage_" + k]["mean_width"])
                                      for k in ["raw", "static"] + [str(w) for w in WINDOWS] + ["aci"]))

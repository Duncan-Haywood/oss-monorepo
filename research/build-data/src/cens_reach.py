"""Session 89: what the censored pseudo-rows (transfer.censored_pseudo) hand the 0.9-quantile model.

For each held-out city H and test year Y, over the source cities' training years <= Y-2 seen on D = 1 January Y:
the open permits, the distribution of their Kaplan-Meier quantile level tau_i, the share with tau_i >= 0.9 (all of
their q0.9 weight goes to the "+infinity" pseudo-row), and, per source city and class, the share of the q0.9
model's training weight at +infinity. Where that share exceeds 0.1, the stratum's 0.9 quantile lies beyond every
window the data have, so it is not identified: a quantile model can only put it "above everything". Also each
stratum's longest and q0.99 completed build (the capped variant's upper pseudo-row is the longest). No model is
fitted.
Run: python3.13 src/cens_reach.py DIR   Writes results/cens_reach_i2c.json.
"""
import argparse, datetime, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transfer  # noqa: E402


def reach(frames, held, Y, tau=0.9):
    D = datetime.date(Y, 1, 1)
    out = dict(n=0, n_open=0, strata={})
    for c in [c for c in transfer.CITIES if c != held and c in frames]:
        d = frames[c][frames[c].year <= Y - 2].assign(city=c)
        rows, W, info = transfer.censored_pseudo(d, D, d, taus=(tau,))
        out["n"] += len(d); out["n_open"] += info["n_open"]
        n_done = info["n_completed"]
        win = np.array([(D - x).days for x in pd.to_datetime(d.start).dt.date], dtype=float)
        w = W[tau]
        inf = rows.y.to_numpy(float) >= transfer.Y_INF
        cls = rows.cls.to_numpy()
        real = np.arange(len(rows)) < n_done + info["n_open"]  # completed rows and the open rows' lower pseudo-row
        for k in pd.unique(cls):
            m = cls == k
            tot = float(w[m].sum())
            done_k = d[(d.cls == k).to_numpy() & (d.y.to_numpy(float) <= win)]
            out["strata"][f"{c}:{k}"] = dict(n=int((m & real).sum()),
                                             share_weight_at_inf=float(w[m & inf].sum() / tot) if tot else None,
                                             longest_completed_days=float(done_k.y.max()) if len(done_k) else None,
                                             q99_completed_days=float(done_k.y.quantile(.99)) if len(done_k) else None)
        out.setdefault("open_tau_i_q10_q50_q90", {})[c] = info["tau_i_q10_q50_q90"]
        out.setdefault("open_share_tau_i_above_0.9", {})[c] = info["share_open_above"][str(tau)]
    s = out["strata"]
    big = {k: v for k, v in s.items() if v["n"] >= 1000}
    out["strata_not_identified_q90"] = sorted(k for k, v in big.items() if (v["share_weight_at_inf"] or 0) > 1 - tau)
    out["rows_in_not_identified_strata"] = int(sum(s[k]["n"] for k in out["strata_not_identified_q90"]))
    out["share_open"] = out["n_open"] / out["n"]
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    a = ap.parse_args()
    cities = [c for c in ("sf", "austin", "seattle") if os.path.exists(os.path.join(a.data_dir, f"{c}.csv"))]
    frames = {c: transfer.frame(os.path.join(a.data_dir, f"{c}.csv"), "i2c", "cascade2")[0] for c in cities}
    res = {f"{h} {Y}": reach(frames, h, Y) for h in ("austin", "sf", "seattle") for Y in (2021, 2022)}
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results", "cens_reach_i2c.json")
    json.dump(res, open(p, "w"), indent=1)
    for k, r in res.items():
        print(k, round(r["share_open"], 4), r["open_share_tau_i_above_0.9"], r["strata_not_identified_q90"],
              r["rows_in_not_identified_strata"])

"""Session 88: how much of the training cut can inverse-probability-of-censoring weights give back?

For each held-out city H and test year Y, over the source cities' training years <= Y-2: the rows still open on
D = 1 January Y (dropped by the cut), the weight mass transfer.ipcw_completed adds back (sum of weights minus rows
kept), and the dropped rows a weight cannot stand for at all: those whose build time exceeds the longest window
any permit of their city-year has at D (G = 0 there). Also the q0.9 of build time over all rows, kept rows, and
kept rows weighted. No model is fitted.
Run: python3.13 src/ipcw_reach.py DIR [--floor 0.05]   Writes results/ipcw_reach_i2c.json.
"""
import argparse, datetime, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transfer  # noqa: E402


def wq(y, w, q):
    o = np.argsort(y)
    cw = np.cumsum(w[o]) / w.sum()
    return float(y[o][np.searchsorted(cw, q)])


def reach(frames, held, Y, floor=0.05):
    D = datetime.date(Y, 1, 1)
    out = dict(n=0, n_dropped=0, n_beyond_window=0, weight_added=0.0, by_city={})
    ys, ks, ws = [], [], []
    for c in [c for c in transfer.CITIES if c != held and c in frames]:
        d = frames[c][frames[c].year <= Y - 2]
        win = np.array([(D - x).days for x in pd.to_datetime(d.start).dt.date], dtype=float)
        y = d.y.to_numpy(float)
        cmax = pd.Series(win).groupby(d.year.to_numpy()).transform("max").to_numpy()
        kept, w = transfer.ipcw_completed(d.assign(city=c), D, floor)
        r = dict(n=len(d), n_dropped=int((y > win).sum()), n_beyond_window=int((y > cmax).sum()),
                 weight_added=float(w.sum() - len(kept)))
        out["by_city"][c] = r
        for k in ("n", "n_dropped", "n_beyond_window", "weight_added"):
            out[k] += r[k]
        seen = y <= win
        ys.append(y); ks.append(seen); ws.append(np.where(seen, 0.0, 0.0)); ws[-1][seen] = w
    y, k, w = np.concatenate(ys), np.concatenate(ks), np.concatenate(ws)
    out["share_dropped"] = out["n_dropped"] / out["n"]
    out["share_of_dropped_recovered_by_weight"] = out["weight_added"] / max(out["n_dropped"], 1)
    out["share_of_dropped_beyond_window"] = out["n_beyond_window"] / max(out["n_dropped"], 1)
    out["q90_days"] = dict(all=float(np.quantile(y, .9)), kept=float(np.quantile(y[k], .9)), kept_ipcw=wq(y[k], w[k], .9))
    out["q99_days"] = dict(all=float(np.quantile(y, .99)), kept=float(np.quantile(y[k], .99)), kept_ipcw=wq(y[k], w[k], .99))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--floor", type=float, default=0.05)
    a = ap.parse_args()
    cities = [c for c in ("sf", "austin", "seattle") if os.path.exists(os.path.join(a.data_dir, f"{c}.csv"))]
    frames = {c: transfer.frame(os.path.join(a.data_dir, f"{c}.csv"), "i2c", "cascade2")[0] for c in cities}
    res = {f"{h} {Y}": reach(frames, h, Y, a.floor) for h in ("austin", "sf", "seattle") for Y in (2021, 2022)}
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results", "ipcw_reach_i2c.json")
    json.dump(res, open(p, "w"), indent=1)
    for k, r in res.items():
        print(k, {x: (round(v, 4) if isinstance(v, float) else v) for x, v in r.items() if x != "by_city"})

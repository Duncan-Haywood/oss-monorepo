"""Milestone 9 (H1, data split resampled): skip-shortcut margin when each seed also draws its own 70/30 split.

Run from this directory:  OMP_NUM_THREADS=1 python3 run.py   (a few minutes on 4 cores)
Writes results.json and results.txt next to this file."""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin_gen import accuracy, bootstrap_ci, load, loss, train  # noqa: E402

SEEDS = 20
TAUS = [1e-3, 1e-2, 3e-2, 1e-1]
SETUPS = {"digits_deep": ("digits", (64, 128, 64, 10)), "breast_cancer": ("breast_cancer", (30, 32, 2))}
DATA = {(k, s): load(v[0], seed=s) for k, v in SETUPS.items() for s in range(SEEDS)}


def job(a):
    name, seed, strategy, tau = a
    sizes, d = SETUPS[name][1], DATA[(name, seed)]
    w, info = train(d, sizes, seed, strategy=strategy, tau=tau)
    return {"loss": loss(w, sizes, d[2], d[3]), "acc": accuracy(w, sizes, d[2], d[3]), "cheated": info["cheated"]}


def main():
    res = {}
    with Pool(4) as pool:
        for name in SETUPS:
            hon = pool.map(job, [(name, s, None, 0.0) for s in range(SEEDS)])
            h = np.array([o["loss"] for o in hon])
            r = {"loss_mean": float(h.mean()), "loss_std": float(h.std(ddof=1)), "rows": []}
            for tau in TAUS:
                outs = pool.map(job, [(name, s, "skip", tau) for s in range(SEEDS)])
                d = np.array([o["loss"] for o in outs]) - h
                lo, hi = bootstrap_ci(d)
                r["rows"].append({"tau": tau, "cheated": float(np.mean([o["cheated"] for o in outs])),
                                  "deg_mean": float(d.mean()), "deg_lo": lo, "deg_hi": hi,
                                  "share_better": float(np.mean(d < 0))})
                print(name, r["rows"][-1], flush=True)
            res[name] = r
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = []
    for k, r in res.items():
        lines.append(f"{k}: honest held-out loss {r['loss_mean']:.4f} (std over splits and seeds {r['loss_std']:.4f})")
        lines.append("    tau       skipped   degradation [95% CI]            splits where skipping is better")
        for x in r["rows"]:
            lines.append(f"    {x['tau']:<9.0e} {x['cheated']:<9.3f} {x['deg_mean']:+.5f} [{x['deg_lo']:+.5f}, {x['deg_hi']:+.5f}]  {x['share_better']:.2f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()

"""Milestone 8 (H1 on other tasks): skip-shortcut margin on a deeper MLP and a second real dataset.

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
TAUS = [1e-4, 1e-3, 1e-2, 3e-2, 1e-1, 3e-1]
SETUPS = {
    "digits_deep": ("digits", (64, 128, 64, 10)),
    "breast_cancer": ("breast_cancer", (30, 32, 2)),
}
DATA = {k: load(v[0]) for k, v in SETUPS.items()}


def job(a):
    name, seed, strategy, tau, referee = a
    sizes = SETUPS[name][1]
    w, info = train(DATA[name], sizes, seed, strategy=strategy, tau=tau, referee=referee, record=strategy is None)
    d = DATA[name]
    out = {"loss": loss(w, sizes, d[2], d[3]), "acc": accuracy(w, sizes, d[2], d[3]), "cheated": info["cheated"]}
    if strategy is None:
        out["norms"], out["drifts"] = info["norms"], info["drifts"]
    return out


def main():
    res = {}
    with Pool(4) as pool:
        for name in SETUPS:
            for referee in ("reorder", "fp16"):
                hon = pool.map(job, [(name, s, None, 0.0, referee) for s in range(SEEDS)])
                h_loss = np.array([h["loss"] for h in hon])
                drifts = np.concatenate([h["drifts"] for h in hon])
                norms = np.concatenate([h["norms"] for h in hon])
                r = {"loss_mean": float(h_loss.mean()), "loss_std": float(h_loss.std(ddof=1)),
                     "acc_mean": float(np.mean([h["acc"] for h in hon])),
                     "drift_q": {q: float(np.quantile(drifts, q)) for q in (0.5, 0.99, 1.0)},
                     "norm_q": {q: float(np.quantile(norms, q)) for q in (0.1, 0.5, 0.9)},
                     "rows": []}
                for tau in TAUS:
                    outs = pool.map(job, [(name, s, "skip", tau, referee) for s in range(SEEDS)])
                    d = np.array([o["loss"] for o in outs]) - h_loss
                    lo, hi = bootstrap_ci(d)
                    r["rows"].append({"tau": tau, "cheated": float(np.mean([o["cheated"] for o in outs])),
                                      "deg_mean": float(d.mean()), "deg_lo": lo, "deg_hi": hi,
                                      "false_dispute": float(np.mean(drifts > tau))})
                    print(name, referee, r["rows"][-1], flush=True)
                res[f"{name}/{referee}"] = r
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = []
    for k, r in res.items():
        lines.append(f"{k}: honest held-out loss {r['loss_mean']:.4f} (seed std {r['loss_std']:.4f}), acc {r['acc_mean']:.3f}")
        lines.append(f"  drift quantiles {r['drift_q']}  honest update-norm quantiles {r['norm_q']}")
        lines.append("    tau       false_dispute  skipped   degradation [95% CI]            > seed std")
        for x in r["rows"]:
            lines.append(f"    {x['tau']:<9.0e} {x['false_dispute']:<14.3f} {x['cheated']:<9.3f} {x['deg_mean']:+.5f} "
                         f"[{x['deg_lo']:+.5f}, {x['deg_hi']:+.5f}]  {'yes' if x['deg_lo'] > 0 and x['deg_mean'] > r['loss_std'] else 'no'}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()

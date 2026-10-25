"""Milestone 18 (H1 on a transformer, split resampled): as milestone 11, but seed s holds out the contiguous 20% block starting at s/SEEDS of the corpus.

Run from this directory:  OMP_NUM_THREADS=1 /path/to/python run.py [seeds]   (needs torch; writes results.json, results.txt)"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch  # noqa: E402
from vtm.margin_tf import bootstrap_ci, heldout, load_text, train  # noqa: E402

torch.set_num_threads(1)
SEEDS = int(sys.argv[1]) if len(sys.argv) > 1 else 10
TAUS = [1e-3, 1e-2, 3e-2, 1e-1]
RAW = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))
FULL = torch.cat([RAW[0], RAW[1]])


def split(seed):
    n = len(FULL)
    k = int(0.2 * n)
    a = int((n - k) * seed / max(SEEDS - 1, 1))
    test = FULL[a:a + k]
    return torch.cat([FULL[:a], FULL[a + k:]]), test, RAW[2]


def job(a):
    seed, strategy, tau = a
    data = split(seed)
    m, info = train(data, seed, strategy=strategy, tau=tau, record=strategy is None)
    out = {"loss": heldout(m, data[1], 32), "cheated": info["cheated"]}
    if strategy is None:
        out["norms"], out["drifts"] = info["norms"], info["drifts"]
    return out


def main():
    with Pool(4) as pool:
        hon = pool.map(job, [(s, None, 0.0) for s in range(SEEDS)])
        h = np.array([o["loss"] for o in hon])
        norms = np.concatenate([o["norms"] for o in hon])
        drifts = np.concatenate([o["drifts"] for o in hon])
        res = {"loss_mean": float(h.mean()), "loss_std": float(h.std(ddof=1)),
               "norm_quantiles": {q: float(np.quantile(norms, q)) for q in (0.1, 0.5, 0.9)},
               "reorder_drift": {"p99": float(np.quantile(drifts, 0.99)), "max": float(drifts.max())}, "rows": []}
        print(res, flush=True)
        for tau in TAUS:
            outs = pool.map(job, [(s, "skip", tau) for s in range(SEEDS)])
            d = np.array([o["loss"] for o in outs]) - h
            lo, hi = bootstrap_ci(d)
            res["rows"].append({"tau": tau, "cheated": float(np.mean([o["cheated"] for o in outs])), "deg_mean": float(d.mean()),
                                "deg_lo": lo, "deg_hi": hi, "share_better": float(np.mean(d < 0))})
            print(res["rows"][-1], flush=True)
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    q = res["norm_quantiles"]
    lines = [f"honest held-out loss {res['loss_mean']:.4f} (seed std {res['loss_std']:.4f}); update norm quantiles 10/50/90%: "
             f"{q[0.1]:.4f} {q[0.5]:.4f} {q[0.9]:.4f}; float32 reorder drift p99 {res['reorder_drift']['p99']:.2e}, max {res['reorder_drift']['max']:.2e}",
             "tau       skipped   degradation [95% CI]            seeds where skipping is better"]
    for x in res["rows"]:
        lines.append(f"{x['tau']:<9.0e} {x['cheated']:<9.3f} {x['deg_mean']:+.5f} [{x['deg_lo']:+.5f}, {x['deg_hi']:+.5f}]  {x['share_better']:.2f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()

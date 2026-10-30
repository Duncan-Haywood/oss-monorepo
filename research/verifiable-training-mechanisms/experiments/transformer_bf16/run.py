"""Milestone 12: bf16 referee drift vs update norms on the milestone 11 transformer, and the skip shortcut judged by a bf16 referee.

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
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def job(a):
    seed, strategy, tau = a
    m, info = train(DATA, seed, strategy=strategy, tau=tau, referee="bf16", record=strategy is None)
    out = {"loss": heldout(m, DATA[1], 32), "cheated": info["cheated"]}
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
               "bf16_drift": {"p50": float(np.quantile(drifts, 0.5)), "p99": float(np.quantile(drifts, 0.99)), "max": float(drifts.max())},
               "false_dispute_at": {str(t): float(np.mean(drifts > t)) for t in (1e-3, 1e-2)}, "rows": []}
        print(res, flush=True)
        for tau in TAUS:
            outs = pool.map(job, [(s, "skip", tau) for s in range(SEEDS)])
            d = np.array([o["loss"] for o in outs]) - h
            lo, hi = bootstrap_ci(d)
            res["rows"].append({"tau": tau, "cheated": float(np.mean([o["cheated"] for o in outs])), "deg_mean": float(d.mean()),
                                "deg_lo": lo, "deg_hi": hi, "share_better": float(np.mean(d < 0))})
            print(res["rows"][-1], flush=True)
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    q, b = res["norm_quantiles"], res["bf16_drift"]
    lines = [f"honest held-out loss {res['loss_mean']:.4f} (seed std {res['loss_std']:.4f}); update norm quantiles 10/50/90%: "
             f"{q[0.1]:.4f} {q[0.5]:.4f} {q[0.9]:.4f}; bf16 referee drift p50 {b['p50']:.2e}, p99 {b['p99']:.2e}, max {b['max']:.2e}; "
             f"honest steps with drift above 1e-3: {res['false_dispute_at']['0.001']:.3f}, above 1e-2: {res['false_dispute_at']['0.01']:.3f}",
             "tau       skipped   degradation [95% CI]            seeds where skipping is better"]
    for x in res["rows"]:
        lines.append(f"{x['tau']:<9.0e} {x['cheated']:<9.3f} {x['deg_mean']:+.5f} [{x['deg_lo']:+.5f}, {x['deg_hi']:+.5f}]  {x['share_better']:.2f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()

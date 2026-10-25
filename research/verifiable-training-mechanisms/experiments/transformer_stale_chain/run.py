"""Milestone 20 (H1 on a transformer): is the stale cheat expensive because reuse chains across steps? Compares "stale" with "stale1" (reuse only after an honest step).

A cheat step is accepted when lr * ||submitted - referee gradient|| <= tau, where the referee recomputes the step on a permuted batch.
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
STRATEGIES = ["stale", "stale1"]
DATA = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def job(a):
    seed, strategy, tau = a
    m, info = train(DATA, seed, strategy=strategy, tau=tau)
    ch = info["chains"]
    return {"loss": heldout(m, DATA[1], 32), "cheated": info["cheated"], "mean_chain": float(np.mean(ch)) if ch else 0.0, "max_chain": max(ch) if ch else 0}


def main():
    res = {"rows": []}
    with Pool(4) as pool:
        h = np.array([o["loss"] for o in pool.map(job, [(s, None, 0.0) for s in range(SEEDS)])])
        res.update(loss_mean=float(h.mean()), loss_std=float(h.std(ddof=1)))
        for strat in STRATEGIES:
            for tau in TAUS:
                outs = pool.map(job, [(s, strat, tau) for s in range(SEEDS)])
                d = np.array([o["loss"] for o in outs]) - h
                lo, hi = bootstrap_ci(d)
                res["rows"].append({"strategy": strat, "tau": tau, "cheated": float(np.mean([o["cheated"] for o in outs])), "mean_chain": float(np.mean([o["mean_chain"] for o in outs])), "max_chain": int(max(o["max_chain"] for o in outs)),
                                    "deg_mean": float(d.mean()), "deg_lo": lo, "deg_hi": hi, "share_better": float(np.mean(d < 0))})
                print(res["rows"][-1], flush=True)
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = [f"honest held-out loss {res['loss_mean']:.4f} (seed std {res['loss_std']:.4f})",
             "cheat      tau       accepted  chain(mean/max) degradation [95% CI]            seeds where cheating is better"]
    for x in res["rows"]:
        lines.append(f"{x['strategy']:<10} {x['tau']:<9.0e} {x['cheated']:<9.3f} {x['mean_chain']:.2f}/{x['max_chain']:<3d}   {x['deg_mean']:+.5f} [{x['deg_lo']:+.5f}, {x['deg_hi']:+.5f}]  {x['share_better']:.2f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()

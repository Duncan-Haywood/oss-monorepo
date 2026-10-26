"""Milestone 26 (H6): does the path-length predictor C carry to the subsample and stale cheats on the transformer?

Run from this directory:  OMP_NUM_THREADS=1 PYTHONPATH=../../src /path/to/python run.py   (needs torch; writes results.json, results.txt)
Reads ../transformer_cheats/results.json (measured degradation, 10 seeds).

From the honest runs only: per step the update norm d_t and the distance e_t of the cheap gradient from the referee's
(subsample: quarter-batch gradient; stale: the previous honest gradient). A step is accepted when e_t <= tau.
a = share of steps accepted; g = sum of d_t over accepted steps / sum of d_t.
Predictor C: honest loss after round((1 - g) T) steps (compressed schedule) minus honest loss."""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch  # noqa: E402
from vtm import margin_tf as tf  # noqa: E402

torch.set_num_threads(1)
SEEDS, T = 10, 600
TXT = tf.load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def job(a):
    seed, steps, record = a
    m, info = tf.train(TXT, seed, steps=steps, record=record)
    return tf.heldout(m, TXT[1], 32), info


def main():
    meas = json.load(open(os.path.join(HERE, "..", "transformer_cheats", "results.json")))
    with Pool(4) as pool:
        hon = pool.map(job, [(s, T, True) for s in range(SEEDS)])
        h = np.array([x[0] for x in hon])
        std = float(h.std(ddof=1))
        cache = {}

        def fewer(steps):
            steps = max(1, int(steps))
            if steps not in cache:
                cache[steps] = np.array([x[0] for x in pool.map(job, [(s, steps, False) for s in range(SEEDS)])])
            return float((cache[steps] - h).mean())

        rows = []
        for r in meas["rows"]:
            key = "dist_" + r["strategy"]
            acc = [np.array(x[1][key]) <= r["tau"] for x in hon]
            norms = [np.array(x[1]["norms"]) for x in hon]
            a = float(np.mean([m.mean() for m in acc]))
            g = float(np.mean([n[m].sum() / n.sum() for n, m in zip(norms, acc)]))
            rows.append({"strategy": r["strategy"], "tau": r["tau"], "measured_accept": r["cheated"], "pred_accept": a,
                         "g_path": g, "measured": r["deg_mean"], "ci": [r["deg_lo"], r["deg_hi"]], "pred_C": fewer(round((1 - g) * T))})
            print(rows[-1], flush=True)
    res = {"honest": float(h.mean()), "std": std, "rows": rows}
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = [f"honest loss {res['honest']:.4f}, seed std {std:.4f}",
             "cheat      tau       accept meas/pred   path%   measured [95% CI]               predC     C/meas"]
    for r in rows:
        den = r["measured"] or float("nan")
        lines.append(f"{r['strategy']:<10} {r['tau']:<9.0e} {r['measured_accept']:.3f}/{r['pred_accept']:.3f}   {100*r['g_path']:<6.2f}  "
                     f"{r['measured']:+.5f} [{r['ci'][0]:+.5f},{r['ci'][1]:+.5f}]  {r['pred_C']:+.5f} {r['pred_C']/den:7.2f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()

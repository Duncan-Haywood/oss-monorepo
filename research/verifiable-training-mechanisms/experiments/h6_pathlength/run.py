"""Milestone 24 (H6): a parameter-free path-length predictor of the skip degradation, on the digits MLP and the transformer.

Run from this directory:  OMP_NUM_THREADS=1 PYTHONPATH=../../src /path/to/python run.py   (needs torch; writes results.json, results.txt)
Reads ../margin/results.json and ../transformer/results.json (measured skip degradation, reorder referee).

Predictors see only honest runs. A: first order, sum |d|^2/lr over skipped steps (digits only, it needs the step lr).
B: honest worker trained round((1 - f) T) steps, f the share of steps with |d| <= tau.
C: as B but with the share of path length g = sum_{|d|<=tau} |d| / sum |d|, so a skipped step costs what it moved."""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch  # noqa: E402
from vtm import margin as dg  # noqa: E402
from vtm import margin_tf as tf  # noqa: E402

torch.set_num_threads(1)
DIG_SEEDS, DIG_T = 20, 1500
TF_SEEDS, TF_T = 10, 600
DIG = dg.load_digits_split()
TXT = tf.load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))


def dig_job(a):
    seed, steps, record = a
    w, info = dg.train(DIG, seed, steps=steps, record=record)
    return dg.loss(w, DIG[2], DIG[3]), info["norms"]


def tf_job(a):
    seed, steps, record = a
    m, info = tf.train(TXT, seed, steps=steps, record=record)
    return tf.heldout(m, TXT[1], 32), info["norms"]


def block(pool, name, job, seeds, T, taus, rows, lrs):
    hon = pool.map(job, [(s, T, True) for s in range(seeds)])
    h = np.array([x[0] for x in hon])
    norms = [np.array(x[1]) for x in hon]
    std = float(h.std(ddof=1))
    cache = {}

    def fewer(steps):  # honest loss at a shortened (compressed-schedule) run, per seed
        steps = max(1, int(steps))
        if steps not in cache:
            cache[steps] = np.array([x[0] for x in pool.map(job, [(s, steps, False) for s in range(seeds)])])
        return float((cache[steps] - h).mean())

    out = []
    for tau in taus:
        m = rows[tau]
        f = float(np.mean([np.mean(n <= tau) for n in norms]))
        g = float(np.mean([n[n <= tau].sum() / n.sum() for n in norms]))
        r = {"tau": tau, "f_steps": f, "g_path": g, "measured": m["deg_mean"], "ci": [m["deg_lo"], m["deg_hi"]],
             "pred_B": fewer(round((1 - f) * T)), "pred_C": fewer(round((1 - g) * T))}
        if lrs is not None:
            r["pred_A"] = float(np.mean([np.sum(n[n <= tau] ** 2 / lrs[n <= tau]) for n in norms]))
        out.append(r)
        print(name, r, flush=True)
    return {"honest": float(h.mean()), "std": std, "rows": out}


def main():
    meas_d = json.load(open(os.path.join(HERE, "..", "margin", "results.json")))
    rows_d = {r["tau"]: r for r in meas_d["cheat"]["reorder/skip"]}
    meas_t = json.load(open(os.path.join(HERE, "..", "transformer", "results.json")))
    rows_t = {r["tau"]: {"deg_mean": r["deg_mean"], "deg_lo": r["deg_lo"], "deg_hi": r["deg_hi"]} for r in meas_t["rows"]}
    lrs = np.array([dg.lr_at(t, DIG_T, 0.2) for t in range(DIG_T)])
    with Pool(4) as pool:
        res = {"digits": block(pool, "digits", dig_job, DIG_SEEDS, DIG_T, meas_d["taus"], rows_d, lrs),
               "transformer": block(pool, "transformer", tf_job, TF_SEEDS, TF_T, sorted(rows_t), rows_t, None)}
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    ok = lambda x: "yes" if 0.5 <= x <= 2 else "no"
    lines = []
    for name, b in res.items():
        lines.append(f"{name}: honest loss {b['honest']:.4f}, seed std {b['std']:.4f}")
        lines.append("tau       steps%  path%   measured [95% CI]               predB     B/meas  predC     C/meas  C in [0.5,2]  class")
        for r in b["rows"]:
            den = r["measured"] or float("nan")
            cls = "scored" if abs(r["measured"]) > b["std"] else ("detectable" if r["ci"][0] > 0 or r["ci"][1] < 0 else "below noise")
            lines.append(f"{r['tau']:<9.0e} {100*r['f_steps']:<7.1f} {100*r['g_path']:<7.2f} {r['measured']:+.5f} [{r['ci'][0]:+.5f},{r['ci'][1]:+.5f}]  "
                         f"{r['pred_B']:+.5f} {r['pred_B']/den:7.2f}  {r['pred_C']:+.5f} {r['pred_C']/den:7.2f}  {ok(r['pred_C']/den):<12}  {cls}")
        lines.append("")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()

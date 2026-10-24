"""Milestone 4, step 1: the actions a worker can take. For each internal skip threshold tau' (the worker skips
every step whose honest update has norm <= tau'), train 20 seeds on the real digits data and record the share
of steps skipped (effort = 1 - share), the held-out loss, and the per-example loss variance (score noise).

Run from this directory:  OMP_NUM_THREADS=1 PYTHONPATH=../../src python3 run.py   (writes actions.json)"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import load_digits_split, train, unpack  # noqa: E402

SEEDS = 20
TAUS = [0.0, 1e-4, 1e-3, 3e-3, 1e-2, 3e-2, 0.1, 0.3, 1.0, 1e9]  # 1e9: skips every step (untrained net)
DATA = load_digits_split()


def per_example_loss(w, x, y):
    w1, b1, w2, b2 = unpack(w)
    o = np.maximum(x @ w1 + b1, 0) @ w2 + b2
    o = o - o.max(1, keepdims=True)
    return np.log(np.exp(o).sum(1)) - o[np.arange(len(y)), y]


def job(args):
    seed, tau = args
    w, info = train(DATA, seed, strategy="skip" if tau > 0 else None, tau=tau)
    li = per_example_loss(w, DATA[2], DATA[3])
    return {"loss": float(li.mean()), "var_example": float(li.var(ddof=1)), "skipped": info["cheated"]}


def main():
    out = {"seeds": SEEDS, "n_test": int(len(DATA[3])), "actions": []}
    with Pool(4) as pool:
        for tau in TAUS:
            r = pool.map(job, [(s, tau) for s in range(SEEDS)])
            out["actions"].append({
                "tau_prime": tau, "skipped": float(np.mean([x["skipped"] for x in r])),
                "loss_mean": float(np.mean([x["loss"] for x in r])),
                "loss_seed_sd": float(np.std([x["loss"] for x in r], ddof=1)),
                "var_example": float(np.mean([x["var_example"] for x in r]))})
            print(out["actions"][-1], flush=True)
    json.dump(out, open(os.path.join(HERE, "actions.json"), "w"), indent=1)


if __name__ == "__main__":
    main()

"""Generate the cart-pole episode pools: results/pool.csv (ctx_id, twin, none-0, one real column per pair).
One command: python3 run_pool.py"""
import csv, os
from multiprocessing import Pool
import numpy as np
from pairs import *

NPOOL = 4000
SEED = 20261025


def job(args):
    name, lo, hi = args
    ctx = sample_contexts(NPOOL, SEED)[lo:hi]
    if name == "twin":
        return name, lo, [episode(c) for c in ctx]
    if name == "none-0":
        return name, lo, [episode(c, {}) for c in ctx]
    e, i = name.rsplit("-", 1)
    return name, lo, [episode(c, EFFECTS[e][int(i)]) for c in ctx]


if __name__ == "__main__":
    names = ["twin", "none-0"] + [pair_name(p) for p in PAIRS]
    chunks = [(n, lo, min(lo + 500, NPOOL)) for n in names for lo in range(0, NPOOL, 500)]
    cols = {n: np.zeros(NPOOL) for n in names}
    with Pool(4) as pool:
        for name, lo, vals in pool.imap_unordered(job, chunks):
            cols[name][lo:lo + len(vals)] = vals
    os.makedirs("results", exist_ok=True)
    with open("results/pool.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ctx_id"] + names)
        for k in range(NPOOL):
            w.writerow([k] + [f"{cols[n][k]:.6f}" for n in names])
    print("wrote results/pool.csv", len(names), "columns")

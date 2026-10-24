"""Simulate a population's hang outcomes (the slow step: one drape each), in parallel."""
import multiprocessing as mp

from .model import simulate_hang


def _one(f):
    s = simulate_hang(f)
    return {k: s[k] for k in ("err", "l0", "strain", "zone", "shoulder_strain", "peak_strain")}


def simulate_all(fabrics, procs=4):
    with mp.Pool(procs) as p:
        return p.map(_one, fabrics, chunksize=8)

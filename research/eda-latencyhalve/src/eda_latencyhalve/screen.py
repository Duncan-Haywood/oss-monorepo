"""Screening a design pool with a cheap rung, then paying for the expensive rung on the top k only. Stdlib only.

Rows come from eda-sky130rung's committed mapped.json (generic cells, flip-flops, depth, cycles from eda-harness;
SKY130 area and ABC critical-path delay from the mapping). latency = cycles x delay.
"""
import json
import math
import random

W = 110  # measured p=1 cycle count of the MAC engine (eda-fidelity calibration)


def load(path):
    rows = json.load(open(path))["rows"]
    for r in rows:
        r["latency_ps"] = r["cycles"] * r["delay_ps"]
    return rows


# objectives the expensive rung can define (minimised)
TRUTH = {
    "area x cycles": lambda r: r["area_um2"] * r["cycles"],
    "area x latency": lambda r: r["area_um2"] * r["latency_ps"],
    "latency": lambda r: r["latency_ps"],
}

# cheap rungs: what a loop has before it pays for a mapping
SCREEN = {
    "analytic p*wb^2*ceil(W/p)": lambda r: r["p"] * r["wb"] ** 2 * math.ceil(W / r["p"]),
    "generic cells x cycles": lambda r: r["gen_cells"] * r["cycles"],
    "generic cells x cycles x depth": lambda r: r["gen_cells"] * r["cycles"] * r["gen_depth"],
}


def order(rows, f, idx=None):
    """Indices sorted best-first by f; ties broken by index so the result is deterministic."""
    idx = range(len(rows)) if idx is None else idx
    return sorted(idx, key=lambda i: (f(rows[i]), i))


def best_in_top_k(rows, screen, truth, k, idx=None):
    """Best true value among the k designs the screen ranks highest (those are the ones mapped)."""
    top = order(rows, screen, idx)[:k]
    return min(truth(rows[i]) for i in top)


def optimum_rank(rows, screen, truth):
    """1-based position of the truly best design in the screen's order (ties in the screen resolved by index)."""
    best = order(rows, truth)[0]
    return order(rows, screen).index(best) + 1


def capture_probability(rows, screen, truth, n0, k, trials, seed=0):
    """Over random pools of n0 designs, P(the best design in the pool is among the screen's top k), and the mean
    ratio of the best true value among those k to the pool's true best."""
    rng = random.Random(seed)
    hit, ratio = 0, 0.0
    for _ in range(trials):
        pool = rng.sample(range(len(rows)), n0)
        tbest = min(truth(rows[i]) for i in pool)
        got = best_in_top_k(rows, screen, truth, k, pool)
        hit += got == tbest
        ratio += got / tbest
    return hit / trials, ratio / trials


def wilson(hits, n, z=1.96):
    """Wilson 95% interval for a binomial proportion."""
    p = hits / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return c - h, c + h

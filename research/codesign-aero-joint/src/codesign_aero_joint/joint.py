"""Joint search over (arm length, prop diameter, three gains) = 5 unit-cube parameters, scored on randomised-plant
training episodes. Methods: CMA-ES and uniform random search, each with an evaluation budget."""
import numpy as np
import cma
from . import aero as A

TRAIN_SEED, TEST_SEED, TRAIN_EP, TEST_EP = 100, 9999, 16, 64
START = [0.25, 0.2, 0.5, 0.5, 0.5]   # a feasible airframe (L 0.135 m, D 0.102 m) with mid gains


def evaluate(X, plant="wide", seed=TRAIN_SEED, episodes=TRAIN_EP):
    """X (N,5) in [0,1]. Returns J = -RMS roll error (deg); -99 for infeasible airframes."""
    X = np.atleast_2d(X)
    return A.score(X[:, :2], X[:, 2:], episodes=episodes, seed=seed, plant=plant)[0]


def run_cma(budget, seed, pop=16, plant="wide"):
    es = cma.CMAEvolutionStrategy(START, 0.25, {"bounds": [0, 1], "seed": seed + 1, "popsize": pop, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < budget:
        xs = np.array(es.ask()); ys = evaluate(xs, plant); n += len(xs)
        es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best:
            best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return bx, best


def run_random(budget, seed, plant="wide", batch=64):
    rng = np.random.default_rng(seed + 500)
    best, bx, n = -1e9, None, 0
    while n < budget:
        xs = rng.uniform(size=(min(batch, budget - n), 5)); ys = evaluate(xs, plant); n += len(xs)
        if ys.max() > best:
            best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return bx, best


def heldout(x, plant="wide"):
    """Held-out RMS error (deg) of one parameter vector on fresh episodes; nan if infeasible."""
    j = float(evaluate(np.asarray(x)[None], plant, TEST_SEED, TEST_EP)[0])
    return float("nan") if j <= -99 else -j

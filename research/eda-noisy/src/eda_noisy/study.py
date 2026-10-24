"""Proposers see objectives corrupted by a persistent per-design error (a stand-in for a cheap, biased fidelity rung);
the found set is scored on the true objectives. Reuses `eda-proposers` (table, proposers, runner) unchanged."""
import os
import numpy as np
from eda_proposers import bench, proposers, table
from eda_proposers.hv import hypervolume, nondominated

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, "..", "..", "..", "eda-proposers", "experiments", "table.jsonl")
STOCH = [c for c in proposers.ALL if c.name != "grid"]
REF = bench.REF


class NoisySpace(table.Space):
    """What the proposer is shown: true normalised objectives plus N(0, sigma) per objective, drawn once per design per run
    (re-querying a design returns the same value, as a deterministic cheap model would)."""

    def __init__(self, rows, sigma, seed):
        super().__init__(rows)
        rng = np.random.default_rng(10_000 + seed)
        self.err = {x: rng.normal(0.0, sigma, 3) for x in sorted(self.t)}

    def evaluate(self, x):
        return tuple(float(v) for v in np.array(super().evaluate(x)) + self.err[x])


def hv_ratio(space, order, budget):
    """True-objective hypervolume of the first `budget` designs over that of the true front (reference 1.1 on scaled objectives)."""
    true = hypervolume(nondominated([space.evaluate(x) for x in space.all()]), REF)
    return hypervolume(nondominated([space.evaluate(x) for x in order[:budget]]), REF) / true


def run(rows, cls, sigma, budget, seed):
    """One run: the proposer sees `sigma`-noisy objectives; returns the true-objective hypervolume ratio of what it picked."""
    true_space = table.Space(rows)
    order = bench.run_once(NoisySpace(rows, sigma, seed), cls, budget, seed)
    return hv_ratio(true_space, order, budget)

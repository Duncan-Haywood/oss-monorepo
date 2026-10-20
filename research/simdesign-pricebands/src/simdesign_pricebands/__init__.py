"""Price-perturbation of the count-vs-mass machine-choice flip (``simdesign-flipseeds``).

Coverage of each of the 8 machine subsets is computed once per (family, seed, weighting) with the
unchanged sibling code; prices are then perturbed without re-simulating, because the coverage of a
subset does not depend on price. Siblings are imported unchanged.
"""
import itertools
import pathlib
import sys

import numpy as np

_R = pathlib.Path(__file__).resolve().parents[3]
for p in ("simdesign-flipseeds", "simdesign-coverweight", "selfrep-nextmachine", "simdesign-processcover"):
    sys.path.insert(0, str(_R / p / "src"))
from simdesign_flipseeds import MACHINES  # noqa: E402
from simdesign_coverweight.weighted import sample_parts, weights, wshop_value  # noqa: E402

NAMES = list(MACHINES)
BASE = np.array([MACHINES[n][1] for n in NAMES])
SUBSETS = [s for r in range(4) for s in itertools.combinations(range(3), r)]  # 8 subsets, () first


def subset_values(kind, seed, n=20000, load=True):
    """{'count': v[8], 'mass': v[8]}: coverage of each machine subset (FDM always present)."""
    parts = sample_parts(n, seed, kind, load=load)
    out = {}
    for mode in ("count", "mass"):
        val = wshop_value(parts, weights(parts, mode))
        out[mode] = np.array([val({"fdm"} | {MACHINES[NAMES[i]][0] for i in s}) for s in SUBSETS])
    return out


def best(values, prices, budget):
    """Index of the best affordable subset; ties go to the cheaper set, then the lower index."""
    cost = np.array([sum(prices[i] for i in s) for s in SUBSETS])
    ok = np.flatnonzero(cost <= budget + 1e-9)
    return min(ok, key=lambda k: (-round(values[k], 12), cost[k], k))


def price_draws(m, spread, rng):
    """m draws of the three prices, each the nominal price times U(1-spread, 1+spread), independent."""
    return BASE * rng.uniform(1 - spread, 1 + spread, size=(m, 3))


def flip_rate(vals, prices, budget, material=0.005):
    """Over price draws: (share where choices differ, share where the count pick loses > material mass coverage)."""
    any_f = mat_f = 0
    for pr in prices:
        c, m = best(vals["count"], pr, budget), best(vals["mass"], pr, budget)
        any_f += c != m
        mat_f += vals["mass"][m] - vals["mass"][c] > material
    return any_f / len(prices), mat_f / len(prices)

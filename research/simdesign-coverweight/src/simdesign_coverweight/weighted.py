"""Mass-weighted coverage on top of ``simdesign_processcover``.

A part's mass proxy is its arm volume w * b * ARM_L (mm^3) times one common density, so weights are
proportional to volume. This ASSUMES every part is made of the same material; it is a proxy for
"a heavy part matters more than a light one", not a real mass. ``coverage`` there counts parts equally.
"""
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "simdesign-processcover" / "src"))
from simdesign_processcover import PROCESSES, feasible, sample_parts  # noqa: E402
from simdesign_processcover.cover import ARM_L  # noqa: E402

__all__ = ["PROCESSES", "feasible", "sample_parts", "weights", "wcoverage", "wshop_value"]


def weights(parts, mode="mass"):
    """Normalised weights summing to 1. 'count': equal. 'mass': proportional to w*b*ARM_L."""
    if mode == "count":
        return np.full(len(parts), 1.0 / len(parts))
    if mode == "mass":
        m = parts[:, 0] * parts[:, 2] * ARM_L
        return m / m.sum()
    raise ValueError(mode)


def wcoverage(procs, parts, wt):
    m = np.zeros(len(parts), bool)
    for p in procs:
        m |= feasible(PROCESSES[p], parts)
    return float(wt[m].sum())


def wshop_value(parts, wt):
    cache = {}

    def value(ps):
        key = frozenset(ps)
        if key not in cache:
            cache[key] = wcoverage(key, parts, wt)
        return cache[key]
    return value

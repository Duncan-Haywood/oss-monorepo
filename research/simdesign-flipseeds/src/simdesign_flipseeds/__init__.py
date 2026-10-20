"""Flip rate of the exhaustive machine choice between count and mass weighting, across seeds.

Imports ``simdesign_coverweight`` and ``selfrep_nextmachine`` unchanged (sibling projects).
"""
import math
import pathlib
import sys

_R = pathlib.Path(__file__).resolve().parents[3]
for p in ("simdesign-coverweight", "selfrep-nextmachine", "simdesign-processcover"):
    sys.path.insert(0, str(_R / p / "src"))
from selfrep_nextmachine.select import exhaustive  # noqa: E402
from simdesign_coverweight.weighted import sample_parts, weights, wshop_value  # noqa: E402

MACHINES = {"cnc router": ("cnc", 800.0), "laser cutter": ("laser", 600.0), "casting setup": ("cast", 300.0)}


def wilson(k, n, z=1.96):
    """Wilson score interval for a binomial proportion k/n."""
    if n == 0:
        return (0.0, 1.0)
    ph = k / n
    d = 1 + z * z / n
    c = (ph + z * z / (2 * n)) / d
    h = z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def choice(parts, mode, budget, machines=MACHINES):
    """Exhaustive machine choice (sorted names) and its coverage under ``mode`` weighting."""
    val = wshop_value(parts, weights(parts, mode))
    ch = exhaustive(machines, budget, val)
    return tuple(sorted(ch)), val({"fdm"} | {machines[n][0] for n in ch})


def flip_stats(kind, budget, seeds, n=20000, load=True):
    """Across ``seeds``: how often count and mass weighting pick different machine sets."""
    flips, cmass, mmass, agree_names = 0, [], [], {}
    for s in seeds:
        p = sample_parts(n, s, kind, load=load)
        cc, _ = choice(p, "count", budget)
        mc, vm = choice(p, "mass", budget)
        vcm = wshop_value(p, weights(p, "mass"))({"fdm"} | {MACHINES[x][0] for x in cc})
        flips += cc != mc
        cmass.append(vm - vcm)  # mass coverage lost by using the count-weighted choice
        agree_names[(cc, mc)] = agree_names.get((cc, mc), 0) + 1
    return {"flips": flips, "n": len(seeds), "ci": wilson(flips, len(seeds)), "loss": cmass, "pairs": agree_names}

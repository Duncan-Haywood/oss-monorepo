"""Penalty-budget search of selfrep-redesign with a rod option whose penalty is tied to mid-span sag.

The other six redesign substitutions keep their assumed penalties from selfrep-redesign. The rod choice is one
extra decision: keep steel rods (a vitamin, penalty 0), or use hardwood or aluminium bar of diameter 8, 10 or
12 mm. ASSUMPTIONS (all mine, stylised): the rod penalty is ``min(1, K * log2(1 + sag/sag_steel_8mm))`` with
K = 0.25, so a rod as stiff as 8 mm steel costs 0.25 and one 20 times sagglier is capped at 1; the 5 N load, moduli
and 12 mm holder limit are inherited from selfrep-rodbeam. Nothing was measured.
"""
import itertools
import math
import pathlib
import sys

_R = pathlib.Path(__file__).resolve().parents[3]
for p in ("selfrep-alurod", "selfrep-rodbeam", "selfrep-redesign", "selfrep-closure"):
    sys.path.insert(0, str(_R / p / "src"))
from selfrep_alurod import alu  # noqa: E402
from selfrep_redesign import design as rd  # noqa: E402
from selfrep_rodbeam import beam as b  # noqa: E402

PROCS = {"fdm", "cnc", "laser"}
LOAD, LONG = 5.0, 0.420
K = 0.25
OTHER = [i for i in range(len(rd.SUBS)) if i != 4]          # index 4 is the wood-smooth-rods substitution
SAG_STEEL = b.deflection("steel", b.D_STD, LONG, LOAD)
ROD_OPTIONS = [("steel", None)] + [(m, d) for m in ("hardwood", "aluminium") for d in (0.008, 0.010, 0.012)]


def rod_penalty(material, d, k=K):
    if material == "steel":
        return 0.0
    return min(1.0, k * math.log2(1 + b.deflection(material, d, LONG, LOAD) / SAG_STEEL))


def rod_name(opt):
    return "steel rods" if opt[0] == "steel" else f"{opt[0]} {1000 * opt[1]:.0f} mm"


def design_of(rod, others):
    """Part list for a rod option plus a subset of the six other substitutions."""
    if rod[0] == "steel":
        return rd.design(tuple(others))
    parts = alu.design_with(rod[0], rod[1])                 # all seven, rod line replaced
    drop = {n for i in OTHER if i not in others for n in rd.SUBS[i].removes}
    adds = {a.name for i in OTHER if i not in others for a in rd.SUBS[i].adds}
    base = [p for p in rd.PARTS if p.variant in ("all", "lm8uu")]
    keep_removed = [p for p in base if p.name in drop]
    parts = [p for p in parts if p.name not in adds] + keep_removed
    return parts


def total_penalty(rod, others, k=K):
    return rod_penalty(*rod, k=k) + sum(rd.SUBS[i].penalty for i in others)


def all_designs():
    for rod in ROD_OPTIONS:
        for r in range(len(OTHER) + 1):
            for others in itertools.combinations(OTHER, r):
                yield rod, others


def exhaustive(budget, metric, k=K, rods=ROD_OPTIONS):
    """Best (rod, others, value) within budget; ties keep the lower penalty."""
    best = None
    for rod, others in all_designs():
        if rod not in rods:
            continue
        pen = total_penalty(rod, others, k)
        if pen > budget + 1e-12:
            continue
        v = rd.closure_of(design_of(rod, others), PROCS, metric)
        if best is None or v > best[2] + 1e-12 or (abs(v - best[2]) <= 1e-12 and pen < best[3]):
            best = (rod, others, v, pen)
    return best


def old_redesign(budget, metric):
    """selfrep-redesign's own search (assumed 0.9 wood rod of 30 g), for comparison."""
    return rd.exhaustive(budget, PROCS, metric)

"""Plate packing on top of ``selfrep-partpool``: the 44 printed parts are grouped k to a plate.

A plate job takes ``k`` part-hours of printing plus ``changeover_h`` (heat-up, bed clear, plate swap; ASSUMED).
Only ``k`` that divide 44 are used so every plate is full and the plates are identical, which is what the
partpool simulator assumes of its jobs.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-partpool" / "src"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-closure" / "src"))
from selfrep_partpool.model import ASSEMBLY_H, Params, default_params, effective_doubling, simulate  # noqa: E402,F401

DIVISORS = (1, 2, 4, 11, 22, 44)


def plated(k, changeover_h, budget=1e9, cv=0.2, asm_h=ASSEMBLY_H):
    """Params for a copy printed k parts per plate; each plate job costs k part-hours + changeover."""
    base = default_params(budget, cv)
    n = len(base.parts)
    if n % k:
        raise ValueError(f"k={k} does not divide {n} parts")
    per_part = sum(base.parts) / n
    return Params(tuple([k * per_part + changeover_h] * (n // k)), asm_h, base.vit_cost, budget, cv)


def work_hours(p):
    """Printer-hours of one copy (plates plus assembly)."""
    return sum(p.parts) + p.asm_h

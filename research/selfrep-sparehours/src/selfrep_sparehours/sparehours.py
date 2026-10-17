"""Printed-spare print hours as repair downtime (stylised).

``selfrep-spares`` lets a printed bushing replace the LM8UU bearing at no cost in machine time. Here a repair that
needs a printed spare waits ``print_h`` extra hours for it. The repair model of ``selfrep-repair`` has one fixed
downtime, so the mean is used: repair_h = base + (share of breakdowns that need a printed spare) x print_h.
Everything numeric is an assumption of this project, not a measurement.
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[3]
for d in ("selfrep-spares", "selfrep-repair", "selfrep-growth"):
    sys.path.insert(0, str(root / d / "src"))
from selfrep_spares.spares import wear_parts  # noqa: E402

BUSHING = "LM8UU linear bearing"


def bushing_rates(k):
    """(breakdown rate per hour of the whole machine, share of breakdowns that hit the printed bushing)
    when the LM8UU is replaced by a printed bushing of life k x the LM8UU life."""
    tot = bush = 0.0
    for p, life in wear_parts():
        r = p.qty / (life * (k if p.name == BUSHING else 1.0))
        tot += r
        if p.name == BUSHING:
            bush = r
    return tot, bush / tot


def mean_repair_h(base_h, print_h, share):
    return base_h + share * print_h


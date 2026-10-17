"""Spare-part cost of repair from the closure of a printer's wear parts (stylised).

``selfrep-repair`` treats the spare-part cost share ``c`` of a repair as a free input. Here ``c`` is derived: a
machine breaks down when one of its wear parts fails (each with an ASSUMED mean life), the failed part is replaced
by a spare, and the spare costs vitamins only if the shop cannot make it (``selfrep_closure.closure.makeable``).
Everything numeric below is an assumption of this project, not a measurement.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-closure" / "src"))
from selfrep_closure.bom import PARTS, SHOPS  # noqa: E402
from selfrep_closure.closure import makeable  # noqa: E402

# ASSUMED mean life in running hours of ONE unit of each wear part (name in selfrep-closure BoM -> hours).
LIFE_H = {
    "840 mm GT2 belt": 4000.0, "900 mm GT2 belt": 4000.0,
    "LM8UU linear bearing": 8000.0, "608 bearing": 20000.0,
    "hot end (e.g. J-head)": 3000.0, "thermistor + heater": 10000.0,
    "end-stop switch (inferred from 3 holders)": 20000.0, "16-tooth GT2 pulley": 20000.0,
}


def wear_parts(variant="lm8uu"):
    by = {p.name: p for p in PARTS if p.variant in ("all", variant)}
    return [(by[n], life) for n, life in LIFE_H.items() if n in by]


def breakdown_rate(variant="lm8uu", life_scale=1.0):
    """Machine breakdown rate per hour: every unit of every wear part fails independently at 1/life."""
    return sum(p.qty / (life * life_scale) for p, life in wear_parts(variant))


def mean_life_h(variant="lm8uu", life_scale=1.0):
    return 1.0 / breakdown_rate(variant, life_scale)


def spare_cost_share(shop, vit_cost, variant="lm8uu", swap=None):
    """Imported-vitamin cost of the spare per breakdown, as a share of ``vit_cost`` (the vitamins of a new copy).

    A failure hits part i with probability proportional to qty_i / life_i; the spare is one unit of that part.
    It costs its unit cost unless the shop can make it. ``swap`` maps a part name to a printable substitute's
    (unit cost, life scale) to test a design change; the substitute is treated as makeable by the printer.
    """
    procs = SHOPS[shop]
    swap = swap or {}
    tot = rate = 0.0
    for p, life in wear_parts(variant):
        r = p.qty / life
        if p.name in swap:
            r = p.qty / (life * swap[p.name][1])
            made = True
        else:
            made = makeable(p, procs)
        tot += r
        if not made:
            rate += r * p.cost
    return rate / tot / vit_cost


def spare_cost_split(shop, vit_cost, variant="lm8uu"):
    """Per wear part: (share of breakdowns, unit cost, made in-house?) for the table in the README."""
    procs = SHOPS[shop]
    ws = wear_parts(variant)
    tot = sum(p.qty / l for p, l in ws)
    return [(p.name, p.qty / l / tot, p.cost, makeable(p, procs)) for p, l in ws]

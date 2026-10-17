"""Penalty-budget search of selfrep-alusearch, re-scored so that imported raw stock is not counted as made.

selfrep-alusearch scored a design by closure, where a makeable line counts fully as made even though the shop
imports the bar, dowel, sheet or filament it is cut or printed from. That rewards heavy parts. Here the score is
what the shop must still import to build one copy (lower is better):

    import_mass_g = vitamin mass + (mass of makeable lines) / yield
    import_cost   = vitamin cost + STOCK_COST_FRAC * (cost of makeable lines) / yield

ASSUMPTIONS (mine, stylised): ``yield`` is the share of imported stock that ends up in the part (the rest is
chips, kerf and failed prints); STOCK_COST_FRAC is the price of the stock as a fraction of the BOM price of the
part made from it. Neither is measured. Penalties are those of selfrep-alusearch.
"""
import pathlib
import sys

_R = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_R / "selfrep-alusearch" / "src"))
from selfrep_alusearch import search as s  # noqa: E402

rd = s.rd
YIELD = 0.8
STOCK_COST_FRAC = 0.3


def imports(parts, yield_=YIELD, frac=STOCK_COST_FRAC):
    """(vitamin_g, stock_g, vitamin_cost, stock_cost) for one copy of the printer + router + laser shop's design."""
    vg = sg = vc = sc = 0.0
    for p in parts:
        if rd.makeable(p, s.PROCS):
            sg += p.qty * p.mass_g / yield_
            sc += frac * p.qty * p.cost / yield_
        else:
            vg += p.qty * p.mass_g
            vc += p.qty * p.cost
    return vg, sg, vc, sc


def import_mass(parts, yield_=YIELD):
    vg, sg, _, _ = imports(parts, yield_)
    return vg + sg


def import_cost(parts, yield_=YIELD, frac=STOCK_COST_FRAC):
    _, _, vc, sc = imports(parts, yield_, frac)
    return vc + sc


def best(budget, objective, k=s.K, rods=s.ROD_OPTIONS):
    """Lowest ``objective(parts)`` within the penalty budget: (rod, others, value, penalty). Ties keep lower penalty."""
    out = None
    for rod, others in s.all_designs():
        if rod not in rods:
            continue
        pen = s.total_penalty(rod, others, k)
        if pen > budget + 1e-12:
            continue
        v = objective(s.design_of(rod, others))
        if out is None or v < out[2] - 1e-9 or (abs(v - out[2]) <= 1e-9 and pen < out[3]):
            out = (rod, others, v, pen)
    return out

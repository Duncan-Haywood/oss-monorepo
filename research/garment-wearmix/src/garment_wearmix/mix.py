"""Wearing-time-weighted benefit of a fabric lever set (builds on garment-comfortcost).

A garment is bought once and worn in all three scenarios. With wearing-time shares
w = (warm room, sunny outdoors, cool room) summing to 1, the expected comfort benefit of a lever
set is sum_i w_i * b_i, where b_i is garment-comfortcost's jointly solved benefit (C) in scenario i.
Harms count (negative b_i). The gated lever is an infrared-transparent shell whose transmittance can
be switched off (Zhang et al. 2019 idea): in each scenario it takes the better of the two states, so
its benefit is max(b_ir, 0), at an ASSUMED premium multiple of the fixed infrared-transparent one.
No premium is a quoted price; no wearing share is climate data.
"""
from itertools import product

from garment_comfortcost.cost import LEVERS, SCEN, CostModel, benefit

SCENS = list(SCEN)
GATE = "ir_gated"
ALL = tuple(LEVERS) + (GATE,)


def _snap(x, tol=1e-6):
    """The PMV root-finder leaves ~1e-7 noise on levers that do nothing; report it as exactly 0."""
    return 0.0 if abs(x) < tol else x


def scen_benefit(names, scen):
    """Benefit (C) in one scenario; the gated lever is switched to its better state per scenario."""
    names = tuple(names)
    if GATE not in names:
        return _snap(benefit(names, scen))
    rest = tuple(n for n in names if n != GATE)
    return _snap(max(benefit(rest, scen), benefit(rest + ("ir_transparent",), scen)))


def expected_benefit(names, w):
    return sum(wi * scen_benefit(names, s) for wi, s in zip(w, SCENS))


def added_retail(model: CostModel, names, gate_multiple=2.0):
    """Added retail USD; the gated lever costs `gate_multiple` x the infrared-transparent premium."""
    rest = tuple(n for n in names if n != GATE)
    c = model.added_retail(rest)
    if GATE in names:
        c += model.added_retail(("ir_transparent",)) * gate_multiple
    return c


def subsets(levers=ALL):
    """All lever subsets, excluding thin+thick together and the fixed + gated infrared lever together."""
    for mask in product([0, 1], repeat=len(levers)):
        sub = tuple(n for n, m in zip(levers, mask) if m)
        if "thin" in sub and "thick" in sub:
            continue
        if GATE in sub and "ir_transparent" in sub:
            continue
        yield sub


def best_for_mix(model, w, budget, gate_multiple=2.0, levers=ALL):
    """Lever set with the largest expected benefit within the added-retail budget (ties: cheaper)."""
    best = ((), 0.0, 0.0)
    for sub in subsets(levers):
        c = added_retail(model, sub, gate_multiple)
        if c > budget + 1e-12:
            continue
        b = expected_benefit(sub, w)
        if b > best[1] + 1e-9 or (abs(b - best[1]) <= 1e-9 and b > 0 and c < best[2] - 1e-12):
            best = (sub, b, c)
    return best


def simplex(n):
    """Wearing-share grid in steps of 1/n over three scenarios."""
    return [(i / n, j / n, (n - i - j) / n) for i in range(n + 1) for j in range(n + 1 - i)]


def breakeven_share(names, scen_from, scen_to):
    """Share of wearing time in scen_from (rest in scen_to) at which expected benefit crosses zero; None if it never does."""
    a, b = scen_benefit(names, scen_from), scen_benefit(names, scen_to)
    if a * b >= 0:
        return None
    return -b / (a - b)

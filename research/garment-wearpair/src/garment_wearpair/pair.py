"""Best two-garment wardrobe against the best single garment (builds on garment-wearmix).

garment-wearmix scored one garment worn in every scenario. Here the wearer owns two garments A and B
(each a lever set) and, in each scenario, wears whichever of {nothing, A, B} is most comfortable.
Expected benefit = sum_i w_i * max(0, b_i(A), b_i(B)); cost = added retail of A plus B against one
total budget. Garments are not stacked (one is worn at a time). Premiums, wearing shares and the
scenarios are assumed, as in garment-wearmix; the gated lever is left out (a pair of fixed garments
is the cheap alternative to a gate).
"""
from functools import lru_cache
from itertools import combinations_with_replacement

from garment_wearmix.mix import SCENS, added_retail, scen_benefit, subsets
from garment_comfortcost.cost import LEVERS

FIXED = tuple(LEVERS)


@lru_cache(maxsize=None)
def scen_vec(sub):
    """Benefit (C) of one garment in each scenario."""
    return tuple(scen_benefit(sub, s) for s in SCENS)


def wardrobe_benefit(garments, w):
    """Expected benefit when the wearer picks the best owned garment (or none) per scenario."""
    vecs = [scen_vec(g) for g in garments]
    return sum(wi * max([0.0] + [v[i] for v in vecs]) for i, wi in enumerate(w))


def best_wardrobe(model, w, budget, size=2, levers=FIXED):
    """Best `size`-garment wardrobe within the total added-retail budget (ties: cheaper).
    Returns (garments, expected benefit, total cost). Owning the empty garment twice is allowed, so a
    pair is never worse than one garment."""
    subs = list(subsets(levers))
    cost = {s: added_retail(model, s) for s in subs}
    best = (((),) * size, 0.0, 0.0)
    for combo in combinations_with_replacement(subs, size):
        c = sum(cost[g] for g in combo)
        if c > budget + 1e-12:
            continue
        b = wardrobe_benefit(combo, w)
        if b > best[1] + 1e-9 or (abs(b - best[1]) <= 1e-9 and b > 0 and c < best[2] - 1e-12):
            best = (combo, b, c)
    return best

"""How much choice error erodes a two-garment wardrobe's edge (builds on garment-wearpair).

garment-wearpair assumed the wearer always wears the best of {nothing, A, B} in each scenario. Here, in each
scenario the wearer picks the best option with probability 1 - e and otherwise one of the other options
uniformly at random. A single garment has options {nothing, A}, so it can be mis-picked too; a pair has
three options, so it has more ways to go wrong. e is an assumed error rate, not measured behaviour.
"""
from garment_wearmix.mix import SCENS, added_retail, subsets
from garment_wearpair.pair import FIXED, scen_vec


def noisy_benefit(garments, w, e, mode="uniform"):
    """Expected benefit (C) when a right option is picked with probability 1 - e per scenario.
    Options are the distinct garments owned plus nothing; two identical garments are one option, so
    owning duplicates cannot dilute the errors. A tied best option counts as right. With probability e
    the wearer picks uniformly among the wrong options (none left: no loss); mode \"worst\" makes every
    error the single worst option instead (wearing the wrong coat for the weather)."""
    opts = {(): None}
    for g in garments:
        opts.setdefault(tuple(sorted(g)), g)
    total = 0.0
    for i, wi in enumerate(w):
        vals = [0.0 if g is None else scen_vec(g)[i] for g in opts.values()]
        best = max(vals)
        wrong = [v for v in vals if v < best - 1e-9]
        total += wi * (best if not wrong else (1 - e) * best + e * (min(wrong) if mode == "worst" else sum(wrong) / len(wrong)))
    return total


def best_noisy(model, w, budget, e, size, levers=FIXED, mode="uniform"):
    """Best `size`-garment wardrobe within the budget when the wearer errs at rate e (ties: cheaper).
    size 1 is the single garment. Returns (garments, expected benefit, cost)."""
    from itertools import combinations_with_replacement
    subs = list(subsets(levers))
    cost = {s: added_retail(model, s) for s in subs}
    best = (((),) * size, 0.0, 0.0)
    for combo in combinations_with_replacement(subs, size):
        c = sum(cost[g] for g in combo)
        if c > budget + 1e-12:
            continue
        b = noisy_benefit(combo, w, e, mode)
        if b > best[1] + 1e-9 or (abs(b - best[1]) <= 1e-9 and b > 0 and c < best[2] - 1e-12):
            best = (combo, b, c)
    return best


def breakeven_error(model, w, budget, levers=FIXED, step=0.02, mode="uniform"):
    """Smallest error rate (grid of `step`) at which the best single garment is at least as good as the best
    pair; None if the pair still wins at e = 1."""
    n = round(1 / step)
    for k in range(n + 1):
        e = k * step
        if best_noisy(model, w, budget, e, 1, levers, mode)[1] >= best_noisy(model, w, budget, e, 2, levers, mode)[1] - 1e-9:
            return e
    return None

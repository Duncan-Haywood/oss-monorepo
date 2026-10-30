"""The screened audit-design rule of milestones 6ak to 6am, as library code (the experiments hold the evidence).

Plan: hand-code a random pilot of about 30% of the audit budget n, then call `screen`. It answers "pooled" (one
stratum: spend the rest of the budget on fresh random items) or "cells" (two strata by the coder's own label,
Neyman-allocated with a floor, `cell_allocation`). The rule is a design-time heuristic with no coverage theorem; it
was checked on GoEmotions and NaijaSenti with zero-shot Qwen2.5 coders (see LOG.md, 6ak to 6am).
"""
TAU = 0.3  # minimum pilot informedness J_hat for coder cells; any value in 0.2 to 0.5 gave widths within 1% (6am)
GUARD = 20  # minimum human positives in the pilot (6al); below it the pilot cannot tell a coder from luck
PILOT_SHARE = 0.3
FLOOR = 0.35  # each coder cell gets at least this share of n (6ai)


def informedness(y, f):
    """Youden's J = sensitivity + specificity - 1 from paired human labels y and coder labels f (0/1). 0.0 when
    the pilot holds no positive or no negative, since J is then undefined."""
    pos = [b for a, b in zip(y, f) if a]
    neg = [b for a, b in zip(y, f) if not a]
    if not pos or not neg:
        return 0.0
    return sum(pos) / len(pos) + sum(1 - b for b in neg) / len(neg) - 1


def screen(y, f, tau=TAU, guard=GUARD):
    """'cells' if the pilot shows an informative coder (J_hat >= tau) and holds at least `guard` human positives,
    else 'pooled'."""
    return "cells" if informedness(y, f) >= tau and sum(y) >= guard else "pooled"


def cell_allocation(n, sizes, s2, floor=FLOOR):
    """Audit sizes per cell: Neyman (n_h proportional to N_h S_h, s2 = variances of y - f per cell, capped at the
    cell size), then each cell raised to floor * n and the excess taken from the cells above their floor, largest first."""
    sw = [N * v ** 0.5 for N, v in zip(sizes, s2)]
    tot = sum(sw)
    alloc = [min(N, max(2, round(n * w / tot))) for w, N in zip(sw, sizes)]
    lo = [min(N, max(2, round(floor * n))) for N in sizes]
    alloc = [max(a, b) for a, b in zip(alloc, lo)]
    over = sum(alloc) - n
    while over > 0:
        k = max((j for j in range(len(alloc)) if alloc[j] > lo[j]), key=lambda j: alloc[j], default=None)
        if k is None:
            break
        d = min(over, alloc[k] - lo[k])
        alloc[k] -= d
        over -= d
    return alloc


def plan_audit(f_all, pilot_y, n, tau=TAU, guard=GUARD, floor=FLOOR):
    """One call from a hand-coded pilot to the rest of the audit. f_all: the coder's 0/1 codes on every corpus item;
    pilot_y: {item index: human 0/1} for a simple random pilot (about PILOT_SHARE * n items); n: total audit budget.
    Returns {"design", "cells", "to_label"}: design is "pooled" or "cells" (`screen`); cells are lists of item
    indices (one cell for pooled, coder-negative then coder-positive for cells); to_label is how many more items to
    draw at random from each cell's unpiloted items, so pilot items count toward n. The coder's codes feed only the
    design; the pilot must be a random draw or J_hat is biased."""
    idx = sorted(pilot_y)
    y = [pilot_y[i] for i in idx]
    f = [f_all[i] for i in idx]
    if screen(y, f, tau, guard) == "pooled":
        return {"design": "pooled", "cells": [list(range(len(f_all)))], "to_label": [max(0, n - len(idx))]}
    cells = [[i for i, c in enumerate(f_all) if c == k] for k in (0, 1)]
    s2 = []
    for cell in cells:
        res = [pilot_y[i] - f_all[i] for i in cell if i in pilot_y]
        if len(res) > 1:
            m = sum(res) / len(res)
            s2.append(max(1e-4, sum((r - m) ** 2 for r in res) / (len(res) - 1)))
        else:
            s2.append(0.25)
    alloc = cell_allocation(n, [len(c) for c in cells], s2, floor)
    return {"design": "cells", "cells": cells,
            "to_label": [max(0, a - sum(1 for i in c if i in pilot_y)) for a, c in zip(alloc, cells)]}

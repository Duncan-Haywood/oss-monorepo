"""The screened audit-design rule of milestones 6ak to 6am, as library code (the experiments hold the evidence).

Plan: hand-code a random pilot of about 30% of the audit budget n, then call `screen`. It answers "pooled" (one
stratum: spend the rest of the budget on fresh random items) or "cells" (two strata by the coder's own label,
Neyman-allocated with a floor, `cell_allocation`). The rule is a design-time heuristic with no coverage theorem; it
was checked on GoEmotions and NaijaSenti with zero-shot Qwen2.5 coders (see LOG.md, 6ak to 6am).
"""
TAU = 0.1  # minimum pilot informedness J_hat for coder cells (LOG.md 7ah, 7ai: 0.1 keeps a J 0.03 coder out and keeps
#           97 to 99% of a J 0.26 to 0.65 coder's gain; 0.2 keeps 81% at J 0.26; was 0.3 from 6am to 7ah)
GUARD = 0  # minimum human positives in the pilot (6al set 20; LOG.md 7ai: at 1% prevalence that sent every draw to
#           pooled and gave up 15% of width; NEG_GUARD and TAU now do its job; guard=20 restores the 6al screen)
TAU_6AM, GUARD_6AM = 0.3, 20  # the screen shipped from 6am to 7ah; experiments before 7ai compare against it
PILOT_SHARE = 0.3
NEG_GUARD = 3  # minimum pilot positives in the coder-negative cell (7r to 7w); the default since 7w, neg_guard=0 turns it off
FLOOR = 0.35  # each coder cell gets at least this share of n (6ai)
WIDTH_MARGIN = 0.0  # keep cells only if the pilot's `predicted_ratio` <= 1 - WIDTH_MARGIN (LOG.md 7ak: removed all 7 cells
#                    the screen made wider than pooled, worst 1.002, and kept 100% of the gain); None turns it off


def informedness(y, f):
    """Youden's J = sensitivity + specificity - 1 from paired human labels y and coder labels f (0/1). 0.0 when
    the pilot holds no positive or no negative, since J is then undefined."""
    pos = [b for a, b in zip(y, f) if a]
    neg = [b for a, b in zip(y, f) if not a]
    if not pos or not neg:
        return 0.0
    return sum(pos) / len(pos) + sum(1 - b for b in neg) / len(neg) - 1


def screen(y, f, tau=TAU, guard=GUARD, neg_guard=NEG_GUARD):
    """'cells' if the pilot shows an informative coder (J_hat >= tau) and holds at least `guard` human positives,
    else 'pooled'. neg_guard (default NEG_GUARD = 3 since 7w; 0 is off) also requires that many human positives among the pilot items the
    coder labelled 0: with fewer, the coder-negative cell's variance estimate is near zero and the cells interval
    undercovers (LOG.md 7r: 84 to 87% at a 5% prevalence with guard 10 alone; neg_guard = NEG_GUARD = 3 restored
    93%+ on NaijaSenti 7r/7s and on GoEmotions gratitude and amusement 7t, 96 to 97%)."""
    if sum(1 for a, b in zip(y, f) if a and not b) < neg_guard:
        return "pooled"
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


def cell_ceiling(sens, spec):
    """Best-case half-width ratio, Neyman coder cells over one pooled stratum, for a coder with this sensitivity and
    specificity: sqrt(sens (1 - spec)) + sqrt((1 - sens) spec). It does not depend on prevalence (LOG.md, 7i: the
    prevalence terms cancel). Asymptotic, no pilot cost and no finite-population correction, so the gain a real
    audit realises is smaller; 1.0 means cells cannot help, and a coder with J = 0.4 cannot do better than about 0.92.
    It is the gain over a pooled audit at lambda = 0 (no control variate). Against `audit_interval`'s pooled path,
    which fits lambda, LOG.md 7l measured the cells/pooled ratio at 0.995, not 0.916: read the ceiling as an upper
    bound on what cells can add, not as a forecast."""
    return (sens * (1 - spec)) ** 0.5 + ((1 - sens) * spec) ** 0.5


def pilot_ceiling(y, f):
    """cell_ceiling from the pilot's own sensitivity and specificity; 1.0 when the pilot holds no positive or no
    negative (nothing to estimate from)."""
    pos = [b for a, b in zip(y, f) if a]
    neg = [b for a, b in zip(y, f) if not a]
    if not pos or not neg:
        return 1.0
    return cell_ceiling(sum(pos) / len(pos), sum(1 - b for b in neg) / len(neg))


PSEUDO = 0.0  # pseudo-count variance floor per coder cell (LOG.md 7am); 0 is off, the rule every experiment before 7am ran


def pseudo_var(y, pseudo):
    """Pseudo-count variance floor for one coder cell's 0/1 labels y: p~(1 - p~) with p~ = (sum(y) + pseudo) /
    (len(y) + 2 pseudo) (pseudo 2 is the plus-four of Agresti and Coull). Inside a coder cell f is constant, so the
    residual y - lambda f has the variance of y, and a cell whose audit holds 0 to 2 positives gets a variance near
    zero; the floor keeps it at about what (pseudo) positives would give (LOG.md 7am). 0.0 when pseudo is 0."""
    if not pseudo:
        return 0.0
    p = (sum(y) + pseudo) / (len(y) + 2 * pseudo)
    return p * (1 - p)


def _cell_s2(f_all, pilot_y, cells, pseudo=0.0):
    """Pilot variance of y - f in each cell (as `plan_audit` allocates): floored at 1e-4, 0.25 with under two items;
    with pseudo > 0 also at least `pseudo_var` of the cell's pilot labels."""
    s2 = []
    for cell in cells:
        ys = [pilot_y[i] for i in cell if i in pilot_y]
        res = [pilot_y[i] - f_all[i] for i in cell if i in pilot_y]
        if len(res) > 1:
            m = sum(res) / len(res)
            s2.append(max(1e-4, sum((r - m) ** 2 for r in res) / (len(res) - 1), pseudo_var(ys, pseudo)))
        else:
            s2.append(0.25)
    return s2


def predicted_ratio(f_all, pilot_y, n, floor=FLOOR, pseudo=0.0):
    """Pilot plug-in forecast of the half-width ratio, coder cells over one pooled stratum, for an audit of n items
    (LOG.md 7ak). Unlike `pilot_ceiling` (asymptotic, Neyman without floor, pooled at lambda 0) it prices what the
    real audit does: the pooled side uses the control-variate weight lambda fitted on the pilot, the cells side the
    floored allocation `cell_allocation` would make, and both carry the finite-population correction. Returns
    sqrt(var_cells / var_pooled) with the variances of `audit_interval`'s estimator at the planned sizes; 1.0 when
    the pilot leaves the pooled variance at zero."""
    idx = sorted(pilot_y)
    y = [pilot_y[i] for i in idx]
    f = [f_all[i] for i in idx]
    N, m = len(f_all), len(idx)
    if m < 3:
        return 1.0
    my, mf = sum(y) / m, sum(f) / m
    vf = sum((b - mf) ** 2 for b in f) / (m - 1)
    lam = 0.0 if vf == 0 else min(1.0, max(0.0, sum((a - my) * (b - mf) for a, b in zip(y, f)) / (m - 1) / vf))
    r = [a - lam * b for a, b in zip(y, f)]
    mr = sum(r) / m
    var_pool = (1 - n / N) * (sum((x - mr) ** 2 for x in r) / (m - 1)) / n
    if var_pool <= 0:
        return 1.0
    cells = [[i for i, c in enumerate(f_all) if c == k] for k in (0, 1)]
    sizes = [len(c) for c in cells]
    if min(sizes) == 0:
        return 1.0
    s2 = _cell_s2(f_all, pilot_y, cells, pseudo)
    alloc = cell_allocation(n, sizes, s2, floor)
    var_cells = sum((Nh / N) ** 2 * (1 - a / Nh) * v / a for Nh, a, v in zip(sizes, alloc, s2))
    return (var_cells / var_pool) ** 0.5


def plan_audit(f_all, pilot_y, n, tau=TAU, guard=GUARD, floor=FLOOR, neg_guard=NEG_GUARD, width_margin=WIDTH_MARGIN,
               pseudo=PSEUDO):
    """One call from a hand-coded pilot to the rest of the audit. f_all: the coder's 0/1 codes on every corpus item;
    pilot_y: {item index: human 0/1} for a simple random pilot (about PILOT_SHARE * n items); n: total audit budget.
    Returns {"design", "cells", "to_label"}: design is "pooled" or "cells" (`screen`); cells are lists of item
    indices (one cell for pooled, coder-negative then coder-positive for cells); to_label is how many more items to
    draw at random from each cell's unpiloted items, so pilot items count toward n. The coder's codes feed only the
    design; the pilot must be a random draw or J_hat is biased. The result also carries "ceiling": the best-case
    half-width ratio of cells over pooled at the pilot's sensitivity and specificity (`pilot_ceiling`), reported for
    the planner and not used by the rule (an upper bound, not a forecast; see `cell_ceiling`): 7h saw the screen pick cells at J = 0.39 for a gain of 0.6% against a
    ceiling of 8%. width_margin (default WIDTH_MARGIN = 0 since 7ak; None turns it off, as every experiment before 7ak ran):
    also send the plan to pooled unless `predicted_ratio` is at most 1 - width_margin. pseudo (default PSEUDO): the
    pseudo-count variance floor (`pseudo_var`) used in the allocation, the width forecast and, carried in the plan,
    by `audit_interval` for each coder cell (LOG.md 7am)."""
    idx = sorted(pilot_y)
    y = [pilot_y[i] for i in idx]
    f = [f_all[i] for i in idx]
    design = screen(y, f, tau, guard, neg_guard)
    if design == "cells" and width_margin is not None and predicted_ratio(f_all, pilot_y, n, floor, pseudo) > 1 - width_margin:
        design = "pooled"
    if design == "pooled":
        return {"design": "pooled", "cells": [list(range(len(f_all)))], "to_label": [max(0, n - len(idx))],
                "ceiling": pilot_ceiling(y, f)}
    cells = [[i for i, c in enumerate(f_all) if c == k] for k in (0, 1)]
    s2 = _cell_s2(f_all, pilot_y, cells, pseudo)
    alloc = cell_allocation(n, [len(c) for c in cells], s2, floor)
    return {"design": "cells", "cells": cells, "pseudo": pseudo,
            "to_label": [max(0, a - sum(1 for i in c if i in pilot_y)) for a, c in zip(alloc, cells)],
            "ceiling": pilot_ceiling(y, f)}


def audit_interval(plan, f_all, labels, z=1.959964):
    """The interval that closes `plan_audit`: (estimate, low, high) for the corpus prevalence. labels: {item index:
    human 0/1} for the pilot plus the items drawn from `to_label`. Estimator of 6ac and 6ad: one control-variate weight
    lambda = cov(y, f) / var(f) clipped to [0, 1], pooled over the audited items, applied in every cell; the stratified
    variance (with finite-population correction); then a Wilson interval on n_eff = p(1-p) / se^2 labels. Needs at
    least two labelled items in each cell. A cells plan made with pseudo > 0 floors each cell's variance at
    `pseudo_var` of its audited labels (LOG.md 7am); a pooled plan never does."""
    import math
    cells = plan["cells"]
    ys = [[labels[i] for i in c if i in labels] for c in cells]
    fs = [[f_all[i] for i in c if i in labels] for c in cells]
    if any(len(y) < 2 for y in ys):
        raise ValueError("each cell needs at least two labelled items")
    ay = [v for y in ys for v in y]
    af = [v for f in fs for v in f]
    mf = sum(af) / len(af)
    vf = sum((v - mf) ** 2 for v in af) / (len(af) - 1)
    my = sum(ay) / len(ay)
    lam = 0.0 if vf == 0 else min(1.0, max(0.0, sum((a - my) * (b - mf) for a, b in zip(ay, af)) / (len(ay) - 1) / vf))
    total = sum(len(c) for c in cells)
    pseudo = plan.get("pseudo", 0.0) if len(cells) > 1 else 0.0
    value = var = 0.0
    for c, y, f in zip(cells, ys, fs):
        r = [a - lam * b for a, b in zip(y, f)]
        mr = sum(r) / len(r)
        v = sum((x - mr) ** 2 for x in r) / (len(r) - 1)
        if pseudo:
            v = max(v, pseudo_var(y, pseudo))
        w = len(c) / total
        value += w * (lam * sum(f_all[i] for i in c) / len(c) + mr)
        var += w * w * (1 - len(y) / len(c)) * v / len(y)
    se = math.sqrt(var)
    p = min(0.9995, max(0.0005, value))
    n = p * (1 - p) / max(se, 1e-9) ** 2
    d = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return value, mid - half, mid + half


def guard_fire_probability(pilot, misses, corpus, neg_guard=NEG_GUARD):
    """Chance that a simple random pilot of `pilot` items, drawn without replacement from a corpus of `corpus` items of
    which `misses` are human positives the coder labelled 0, holds at least `neg_guard` of them: the hypergeometric
    upper tail P(X >= neg_guard). This is the chance that the negative-cell guard lets `screen` pick cells when tau and
    guard are off (LOG.md 7ae: the guard, not the audit's share of the corpus, sets how often cells are used; 7af checks
    this forecast against every committed cell). With tau > 0 the screen also needs J_hat >= tau, so read it as an
    upper bound there."""
    from math import comb
    if pilot > corpus or misses > corpus:
        raise ValueError("pilot and misses cannot exceed the corpus")
    total = comb(corpus, pilot)
    below = sum(comb(misses, k) * comb(corpus - misses, pilot - k) for k in range(min(neg_guard, pilot + 1)))
    return 1.0 - below / total


def pilot_for_guard(prevalence, sensitivity, corpus, target=0.9, neg_guard=NEG_GUARD):
    """Smallest pilot size whose `guard_fire_probability` reaches `target`, for a corpus of `corpus` items with this
    prevalence and coder sensitivity (misses = round(corpus * prevalence * (1 - sensitivity))). The planning rule of
    LOG.md 7af: the guard fires once the pilot expects about 5.3 missed positives (Poisson P(X >= 3) = 0.9), so the
    pilot needs about 5.3 / (prevalence * (1 - sensitivity)) items whatever the corpus size. None if even the whole
    corpus does not reach the target."""
    misses = round(corpus * prevalence * (1 - sensitivity))
    if misses < neg_guard:
        return None
    lo, hi = 1, corpus
    if guard_fire_probability(hi, misses, corpus, neg_guard) < target:
        return None
    while lo < hi:
        mid = (lo + hi) // 2
        if guard_fire_probability(mid, misses, corpus, neg_guard) >= target:
            hi = mid
        else:
            lo = mid + 1
    return lo


def cells_probability(pilot, hits, misses, false_pos, corpus, neg_guard=NEG_GUARD, tau=0.0):
    """Exact chance that `screen(..., tau=0, guard=0, neg_guard)` answers 'cells' for a simple random pilot of `pilot`
    items from a corpus with `hits` coder-positive and `misses` coder-negative human positives and `false_pos`
    coder-positive human negatives: P(FN >= neg_guard and J_hat >= 0) over the multivariate hypergeometric pilot counts.
    J_hat >= 0 fails when the pilot's misses come with no hit (sens_hat = 0), which is why `guard_fire_probability`
    overstates the share at small pilots with a weak coder (LOG.md 7af: 33.9% forecast against 18% observed for a
    J 0.26 coder; this function gives 19.3%, and matches all 36 committed cells within 3.2 points). Terms under 1e-15
    are dropped. tau > 0 (LOG.md 7ah) gives P(FN >= neg_guard and J_hat >= tau), the share for
    `screen(..., tau=tau, guard=0, neg_guard)`; the J_hat test uses the same floating-point arithmetic as
    `informedness`, so ties at the boundary fall the same way."""
    from math import lgamma, exp

    def lc(n, k):
        return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1)
    neg_pop = corpus - hits - misses
    if min(hits, misses, false_pos) < 0 or false_pos > neg_pop or pilot > corpus:
        raise ValueError("counts must be non-negative and fit in the corpus")
    total, tn_pop, p = lc(corpus, pilot), neg_pop - false_pos, 0.0
    for a in range(neg_guard, min(misses, pilot) + 1):
        for b in range(0, min(hits, pilot - a) + 1):
            m = pilot - a - b
            if m > neg_pop:
                continue
            lab = lc(misses, a) + lc(hits, b) + lc(neg_pop, m) - total
            if lab < -35:
                continue
            # c = false positives among the m pilot negatives, hypergeometric; J_hat = b/(a+b) - c/m (as informedness,
            # 0.0 with no pilot positive or no pilot negative), so J_hat >= tau holds for c up to a largest value
            if a + b == 0 or m == 0:
                if tau > 0:
                    continue
                cmax = min(false_pos, m)
            elif tau == 0:
                cmax = min(false_pos, m, (b * m) // (a + b))
            else:
                def ok(c):
                    return b / (a + b) + (m - c) / m - 1 >= tau
                c0 = int((b / (a + b) - tau) * m)
                while c0 + 1 <= m and ok(c0 + 1):
                    c0 += 1
                while c0 >= 0 and not ok(c0):
                    c0 -= 1
                cmax = min(false_pos, c0)
            cmin = max(0, m - tn_pop)
            if cmax < cmin:
                continue
            base = lc(neg_pop, m)
            p += exp(lab) * sum(exp(lc(false_pos, c) + lc(tn_pop, m - c) - base) for c in range(cmin, cmax + 1))
    return min(1.0, p)

"""Budgeted weighted coverage: the shape of the printer-redesign problem at larger size.

Each substitution i has a penalty p[i] and covers a set of vitamin lines (bitmask c[i]); each line j has a
weight w[j] (the mass or cost made makeable). Pick substitutions within a penalty budget to maximise the
total weight of covered lines. Overlap (two substitutions covering the same line) makes gains non-additive,
which is what the 7-item `selfrep-redesign` list (almost) lacks. Instances here are synthetic.
"""
import random


def value(mask_cover, w):
    return sum(w[j] for j in range(len(w)) if mask_cover >> j & 1)


def random_instance(rng, n_subs, n_lines, overlap):
    """Lines get log-normal weights; each substitution covers 1-3 lines. `overlap` in [0, 1] is the chance
    that a covered line is drawn from the 'popular' third of lines rather than uniformly."""
    w = [rng.lognormvariate(0, 1) for _ in range(n_lines)]
    popular = list(range(max(1, n_lines // 3)))
    cov, pen = [], []
    for _ in range(n_subs):
        m = 0
        for _ in range(rng.randint(1, 3)):
            j = rng.choice(popular) if rng.random() < overlap else rng.randrange(n_lines)
            m |= 1 << j
        cov.append(m)
        pen.append(rng.uniform(0.3, 0.9))
    return w, cov, pen


def exact(w, cov, pen, budget):
    """Best value by depth-first search over subsets with a simple optimistic bound."""
    n = len(cov)
    order = sorted(range(n), key=lambda i: -value(cov[i], w) / pen[i])
    best = [0.0]
    total = sum(w)

    def rec(k, covered, spent, val):
        if val > best[0]:
            best[0] = val
        if k == n or val >= total:
            return
        # bound: remaining budget at the best remaining gain/penalty ratio
        rem = budget - spent
        ratio = max((value(cov[i], w) / pen[i] for i in order[k:]), default=0)
        if val + rem * ratio <= best[0] + 1e-12:
            return
        i = order[k]
        if spent + pen[i] <= budget + 1e-12:
            c2 = covered | cov[i]
            rec(k + 1, c2, spent + pen[i], value(c2, w))
        rec(k + 1, covered, spent, val)

    rec(0, 0, 0.0, 0.0)
    return best[0]


def greedy(w, cov, pen, budget):
    """Repeatedly add the substitution with the best marginal gain per penalty that still fits."""
    covered, spent, chosen = 0, 0.0, set()
    while True:
        base = value(covered, w)
        pick, score = None, 0.0
        for i in range(len(cov)):
            if i in chosen or spent + pen[i] > budget + 1e-12:
                continue
            g = (value(covered | cov[i], w) - base) / pen[i]
            if g > score + 1e-12:
                pick, score = i, g
        if pick is None:
            return base
        chosen.add(pick); covered |= cov[pick]; spent += pen[pick]


def greedy_plus_single(w, cov, pen, budget):
    """Greedy, or the best single affordable substitution if that is larger (the classic knapsack fix)."""
    single = max((value(cov[i], w) for i in range(len(cov)) if pen[i] <= budget), default=0.0)
    return max(greedy(w, cov, pen, budget), single)


def random_search(rng, w, cov, pen, budget, evals):
    """Best of `evals` random feasible subsets built by adding random substitutions until none fits."""
    best = 0.0
    for _ in range(evals):
        idx = list(range(len(cov))); rng.shuffle(idx)
        covered, spent = 0, 0.0
        for i in idx:
            if spent + pen[i] <= budget + 1e-12:
                covered |= cov[i]; spent += pen[i]
        best = max(best, value(covered, w))
    return best


def local_search(rng, w, cov, pen, budget, restarts=5):
    """Hill climb on add/drop/swap moves from random feasible starts; returns the best value found."""
    n = len(cov)

    def val(s):
        m = 0
        for i in s:
            m |= cov[i]
        return value(m, w)

    best = 0.0
    for _ in range(restarts):
        s = set()
        for i in rng.sample(range(n), n):
            if sum(pen[j] for j in s) + pen[i] <= budget + 1e-12:
                s.add(i)
        cur = val(s)
        improved = True
        while improved:
            improved = False
            spent = sum(pen[j] for j in s)
            moves = [s | {i} for i in range(n) if i not in s and spent + pen[i] <= budget + 1e-12]
            moves += [(s - {a}) | {b} for a in s for b in range(n)
                      if b not in s and spent - pen[a] + pen[b] <= budget + 1e-12]
            for t in moves:
                v = val(t)
                if v > cur + 1e-12:
                    s, cur, improved = t, v, True
                    break
        best = max(best, cur)
    return best

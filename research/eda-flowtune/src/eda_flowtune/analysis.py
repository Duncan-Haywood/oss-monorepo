"""Pure analysis of a score table {design: {sequence: score}} (lower is better, inf = ABC aborted). No Yosys needed."""
import math
import random

import numpy as np

from .space import PASSES, MAXLEN


def optimum(tab):
    s = min(tab, key=tab.get)
    return s, tab[s]


def finite(tab):
    return {s: v for s, v in tab.items() if math.isfinite(v)}


def _ranks(x):
    x = np.asarray(x, float)
    order = np.argsort(x, kind="mergesort")
    r = np.empty(len(x))
    i = 0
    while i < len(x):
        j = i
        while j + 1 < len(x) and x[order[j + 1]] == x[order[i]]:
            j += 1
        r[order[i:j + 1]] = (i + j) / 2.0
        i = j + 1
    return r


def spearman(a, b):
    ra, rb = _ranks(a), _ranks(b)
    if ra.std() == 0 or rb.std() == 0:
        return float("nan")
    return float(np.corrcoef(ra, rb)[0, 1])


def rank_correlation(tables):
    """Spearman correlation of scores between each pair of designs over sequences finite in both."""
    names = sorted(tables)
    out = {}
    for a in names:
        for b in names:
            common = [s for s in tables[a] if math.isfinite(tables[a][s]) and math.isfinite(tables[b][s])]
            out[(a, b)] = spearman([tables[a][s] for s in common], [tables[b][s] for s in common])
    return out


def regret(tab, seq):
    """score / optimum of the table (1.0 is best; inf if the sequence aborts)."""
    return tab[seq] / optimum(tab)[1]


def consensus_ranking(tables, designs):
    """Sequences finite on every listed design, ordered by mean log(score / that design's optimum)."""
    opt = {d: optimum(tables[d])[1] for d in designs}
    seqs = [s for s in tables[designs[0]] if all(math.isfinite(tables[d][s]) for d in designs)]
    return sorted(seqs, key=lambda s: (sum(math.log(tables[d][s] / opt[d]) for d in designs) / len(designs), s))


def transfer_matrix(tables):
    """regret[(source, target)]: the target's score under the source's own best sequence, over the target's optimum."""
    return {(a, b): regret(tables[b], optimum(tables[a])[0]) for a in tables for b in tables}


def leave_one_out(tables, baseline):
    """Per target design, regret (score / target optimum) of: the consensus-best sequence of the other designs (never sees the
    target); the best sequence of each single other design (mean and worst); the median sequence; the no-pass baseline."""
    rows = {}
    for t in sorted(tables):
        others = [d for d in sorted(tables) if d != t]
        cons = consensus_ranking(tables, others)
        fin = sorted(v / optimum(tables[t])[1] for v in tables[t].values() if math.isfinite(v))
        rows[t] = {
            "consensus": regret(tables[t], cons[0]),
            "consensus_rank_in_target": 1 + sum(1 for v in tables[t].values() if v < tables[t][cons[0]]),
            "single_source_mean": float(np.mean([regret(tables[t], optimum(tables[o])[0]) for o in others])),
            "single_source_worst": max(regret(tables[t], optimum(tables[o])[0]) for o in others),
            "median_sequence": fin[len(fin) // 2],
            "baseline": baseline[t] / optimum(tables[t])[1],
        }
    return rows


def neighbour(seq, rng):
    seq = list(seq)
    moves = ["replace"] + (["insert"] if len(seq) < MAXLEN else []) + (["delete"] if seq else [])
    m = rng.choice(moves)
    if m == "insert":
        seq.insert(rng.randint(0, len(seq)), rng.choice(PASSES))
    elif m == "delete":
        del seq[rng.randrange(len(seq))]
    elif seq:
        seq[rng.randrange(len(seq))] = rng.choice(PASSES)
    else:
        seq = [rng.choice(PASSES)]
    return tuple(seq)


def random_seq(rng):
    return tuple(rng.choice(PASSES) for _ in range(rng.randint(0, MAXLEN)))


class Budget:
    """Replays a table; `calls` counts distinct sequences asked for (the budget unit)."""

    def __init__(self, tab):
        self.tab, self.seen = tab, {}

    @property
    def calls(self):
        return len(self.seen)

    def __call__(self, seq):
        if seq not in self.seen:
            self.seen[seq] = self.tab[seq]
        return self.seen[seq]

    def best(self):
        return min(self.seen.values())


def random_search(tab, budget, rng):
    ev = Budget(tab)
    while ev.calls < budget:
        ev(random_seq(rng))
    return ev.best()


def hill_climb(tab, budget, rng, starts=()):
    """First-improvement hill climbing; the first sequences come from `starts` (a warm start), then fresh random starts
    after 8 failed edits. The climber moves from the best warm-start point."""
    ev = Budget(tab)
    cur, cs, fails = None, None, 0
    for s in starts:
        if ev.calls >= budget:
            break
        v = ev(s)
        if cs is None or v < cs:
            cur, cs = s, v
    while ev.calls < budget:
        if cur is None or fails >= 8:
            cur = random_seq(rng)
            cs = ev(cur)
            fails = 0
            continue
        q = neighbour(cur, rng)
        v = ev(q)
        if v < cs:
            cur, cs, fails = q, v, 0
        else:
            fails += 1
    return ev.best()


def search_study(tables, budgets, seeds, warm_k=3):
    """Median best-found / optimum per target design, method and budget. Warm start = the leave-one-out consensus top `warm_k`."""
    res = {}
    for t in sorted(tables):
        tab = tables[t]
        opt = optimum(tab)[1]
        warm = consensus_ranking(tables, [d for d in sorted(tables) if d != t])[:warm_k]
        for b in budgets:
            for name, fn in (("random", lambda r: random_search(tab, b, r)),
                             ("hill", lambda r: hill_climb(tab, b, r)),
                             ("warm", lambda r: hill_climb(tab, b, r, starts=warm))):
                vals = sorted(fn(random.Random(1000 * s + b)) / opt for s in range(seeds))
                res[(t, name, b)] = {"median": vals[len(vals) // 2], "hit": sum(v == 1.0 for v in vals) / len(vals)}
    return res

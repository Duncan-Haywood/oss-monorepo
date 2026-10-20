"""Uncertainty for eda-equivpredict's leave-one-line-out accuracy.

The 27 survivors sit on only 14 distinct source lines, and mutants on one line mostly share an
outcome, so the effective sample is closer to 14 than 27. Two tools, both stdlib:

* a cluster bootstrap that resamples whole lines (not mutants) of the leave-one-line-out hit/miss
  vector, and
* a permutation test that shuffles the per-line label groups across the observed line positions
  and re-scores the full leave-one-line-out nearest-line predictor each time.
"""
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "eda-equivpredict", "src"))
from eda_equivpredict import predict as P  # noqa: E402

load = P.load
survivors = P.survivors


def by_line(rows):
    g = {}
    for r in rows:
        g.setdefault(P.features(r)["line"], []).append(r)
    return dict(sorted(g.items()))


def hits(rows, predictor=P.predict_line_knn):
    """Leave-one-line-out hit (True/False) for each row, in row order."""
    return [p == P.label(r) for p, r in zip(P.loo_by_line(rows, predictor), rows)]


def cluster_bootstrap(rows, n=10000, seed=0, alpha=0.05):
    """Percentile CI for accuracy, resampling lines with replacement (hits held fixed)."""
    groups = list(by_line(rows).values())
    h = {id(r): x for r, x in zip(rows, hits(rows))}
    per = [(sum(h[id(r)] for r in g), len(g)) for g in groups]
    rng = random.Random(seed)
    accs = []
    for _ in range(n):
        k = m = 0
        for _ in per:
            a, b = per[rng.randrange(len(per))]
            k += a
            m += b
        accs.append(k / m)
    accs.sort()
    return accs[int(n * alpha / 2)], accs[int(n * (1 - alpha / 2)) - 1]


def line_level_accuracy(rows):
    """Fraction of lines whose majority hit is a hit (an unweighted-by-duplicates view)."""
    h = {id(r): x for r, x in zip(rows, hits(rows))}
    gs = by_line(rows).values()
    return sum(sum(h[id(r)] for r in g) * 2 > len(g) for g in gs) / len(gs)


def permutation_p(rows, n=5000, seed=0):
    """One-sided p: chance that shuffling line groups across line positions scores >= observed.

    Each line keeps its group size and internal outcome pattern; only which line position carries
    which group changes, so duplication is preserved and only the line-to-outcome link is broken.
    """
    obs = sum(hits(rows)) / len(rows)
    rng = random.Random(seed)
    items = list(by_line(rows).items())
    positions = [ln for ln, _ in items]
    groups = [g for _, g in items]
    ge = 0
    for _ in range(n):
        perm = groups[:]
        rng.shuffle(perm)
        # Group sizes may differ from the position's own, so build a synthetic row list where
        # each shuffled group is placed at consecutive positions' line values (cycled).
        synth = []
        i = 0
        for pos, g in zip(positions, perm):
            for r in g:
                s = dict(r)
                s["id"] = "%s@%d:%s" % (P.features(r)["kind"], pos, P.features(r)["note"])
                s["i"] = i
                i += 1
                synth.append(s)
        ge += sum(hits(synth)) / len(synth) >= obs - 1e-12
    return obs, (ge + 1) / (n + 1)

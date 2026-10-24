"""Audit designs for prevalence in K groups at once: draw the hand-coded audit at random or with equal numbers per group,
and report per-group prediction-powered intervals, with or without a Bonferroni widening for the K intervals.

Stdlib only. Builds on ../qual-stratified (two-group designs) and ../qual-correction (the estimators).
"""
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-correction"))
import qualml as q  # noqa: E402


def bin_groups(words, edges):
    """Group index of each item by word count; `edges` are the upper bounds (inclusive) of all bins but the last."""
    return [sum(w > e for e in edges) for w in words]


def z_for(k, adjust):
    """Two-sided 95% critical value; 'bonferroni' widens it so that K intervals are jointly 95%."""
    if adjust == "none":
        return q.Z95
    return statistics.NormalDist().inv_cdf(1 - 0.025 / k)


def equal_counts(sizes, n):
    """Split n audit items evenly over the groups; a group smaller than its share gives the rest to the others."""
    counts = [0] * len(sizes)
    open_ = list(range(len(sizes)))
    left = n
    while left > 0 and open_:
        share = max(1, left // len(open_))
        nxt = []
        for g in open_:
            take = min(share, sizes[g] - counts[g], left)
            counts[g] += take
            left -= take
            if counts[g] < sizes[g]:
                nxt.append(g)
        open_ = nxt
    return counts


def draw(design, n, members, rng):
    """Audited indices per group. members[g] lists the items in group g."""
    if design == "random":
        pool = [(g, i) for g, m in enumerate(members) for i in m]
        out = [[] for _ in members]
        for g, i in rng.sample(pool, n):
            out[g].append(i)
        return out
    counts = equal_counts([len(m) for m in members], n)
    return [rng.sample(m, c) for m, c in zip(members, counts)]


def group_ppi(llm, human, members, gold, min_gold=5):
    """Per-group (estimate, se), or None if any group has fewer than `min_gold` audited items."""
    if any(len(g) < min_gold for g in gold):
        return None
    return [q.ppi([llm[i] for i in m], [llm[i] for i in g], [human[i] for i in g]) for m, g in zip(members, gold)]

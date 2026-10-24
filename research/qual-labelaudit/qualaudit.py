"""Audit designs that sample by the coder's own label: estimate a code's prevalence from a coder's labels plus a
hand-coded audit drawn at random, with equal numbers of coder-positive and coder-negative items, with Neyman
allocation, or from coder-positive items only (the "sensitivity audit").

Stdlib only. Builds on ../qual-gapaudit (and through it ../qual-correction). The coder's label is known for every
item, so stratifying on it costs nothing and needs no weights beyond the stratum shares, which are known exactly.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-gapaudit"))
import qualgap as qg  # noqa: E402

q = qg.q


def strata(llm):
    """Indices of coder-negative and coder-positive items."""
    return [i for i, c in enumerate(llm) if not c], [i for i, c in enumerate(llm) if c]


def draw(design, n_gold, neg, pos, rng, share_pos=None):
    """Audited indices (negatives, positives). 'random' and 'poststrat': one random sample of all items;
    'equal': n/2 per coder label; 'neyman': share_pos of the audit to coder-positive items;
    'positives': the whole audit among coder-positive items."""
    if design in ("random", "poststrat"):
        pool = rng.sample(neg + pos, n_gold)
        s = set(pos)
        return [i for i in pool if i not in s], [i for i in pool if i in s]
    if design == "positives":
        return [], rng.sample(pos, min(n_gold, len(pos)))
    share = 0.5 if design == "equal" else share_pos
    n1 = min(len(pos), max(2, round(n_gold * share)))
    n0 = min(len(neg), max(2, n_gold - n1))
    return rng.sample(neg, n0), rng.sample(pos, n1)


def stratified(human, neg, pos, gneg, gpos, assume_zero_negatives=False):
    """Prevalence from known stratum shares and the audit's mean human code in each stratum (equivalently the
    prediction-powered estimate with the coder-label strata as the prediction). Returns (estimate, se). With
    assume_zero_negatives the unaudited coder-negative stratum counts as having no positives (biased by the coder's
    miss rate times that stratum's share). se ignores the finite-population correction, so it is conservative."""
    n = len(neg) + len(pos)
    est = var = 0.0
    for idx, g in ((neg, gneg), (pos, gpos)):
        w = len(idx) / n
        if not g:
            if assume_zero_negatives and idx is neg:
                continue
            raise ValueError("empty audit in a stratum")
        h = [human[i] for i in g]
        est += w * q.mean(h)
        var += w * w * q.var(h) / len(h)
    return est, math.sqrt(var)


def allocation(human, neg, pos):
    """Audit share for coder-positive items minimising the variance of the stratified estimate: proportional to
    stratum share times the sd of the human code within it (Neyman; Cochran 1977). Oracle: uses the full data."""
    n = len(neg) + len(pos)
    s1 = len(pos) / n * q.var([human[i] for i in pos]) ** 0.5
    s0 = len(neg) / n * q.var([human[i] for i in neg]) ** 0.5
    return s1 / (s0 + s1)

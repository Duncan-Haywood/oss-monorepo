"""Audit coder-negatives at a lower rate than coder-positives and weight them back by the known stratum shares.

Stdlib only. Builds on ../qual-labelaudit (draw, stratified estimator, Neyman allocation). The estimator is the
inverse-probability one: each audited item stands for (stratum size / items audited in the stratum) corpus items, which
for two strata with known sizes is the stratified mean. Sweeping the share of the audit given to coder-negatives from 0
(the positives-only audit, biased by the miss rate) up to 0.5 (equal numbers) shows how low that share can go.
"""
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-labelaudit"))
import qualaudit as qa  # noqa: E402

q = qa.q


def draw(n_gold, neg_share, neg, pos, rng):
    """Audit n_gold items, a fraction neg_share of them among coder-negatives (at least 2 per stratum unless the
    share is 0, which audits positives only)."""
    if neg_share <= 0:
        return qa.draw("positives", n_gold, neg, pos, rng)
    return qa.draw("neyman", n_gold, neg, pos, rng, share_pos=1 - neg_share)


def sampling_rates(n_gold, neg_share, neg, pos):
    """Per-item audit probability in each stratum (negatives, positives): the lower-rate design's inclusion
    probabilities. Their ratio is how much each audited negative is up-weighted."""
    n0 = min(len(neg), max(2, round(n_gold * neg_share)))
    n1 = min(len(pos), max(2, n_gold - n0))
    return n0 / len(neg), n1 / len(pos)


def weighted_prevalence(human, neg, pos, gneg, gpos):
    """Horvitz-Thompson-style estimate with the fixed-size stratum weights: sum over audited items of human code
    divided by its inclusion probability, over the corpus size. Equals qa.stratified when both strata are audited;
    written out so the weights are visible."""
    n = len(neg) + len(pos)
    tot = sum(human[i] for i in gneg) * len(neg) / len(gneg) + sum(human[i] for i in gpos) * len(pos) / len(gpos)
    return tot / n


def recall(human, neg, pos, gneg, gpos):
    """Estimated recall of the coder: estimated true positives (coder-positive stratum) over estimated positives."""
    n = len(neg) + len(pos)
    tp = len(pos) * q.mean([human[i] for i in gpos])
    fn = len(neg) * q.mean([human[i] for i in gneg])
    return tp / (tp + fn) if tp + fn else math.nan

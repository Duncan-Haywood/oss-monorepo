"""Audit coder-negatives at a lower rate and weight them back in: a stratified prevalence estimate where the
hand-coded audit puts a share `share_pos` of its items on coder-positive items and the rest on coder-negative items.
Stratum sizes are known exactly (the coder labels every item), so the weights are the stratum shares, which is
Horvitz-Thompson / importance sampling by coder label with inclusion probability n_s / N_s per stratum.

Stdlib only. Builds on ../qual-labelaudit (draw, stratified, allocation).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-labelaudit"))
import qualaudit as qa  # noqa: E402

q = qa.q
MIN_PER_STRATUM = 2


def negatives_needed(n_gold, share_pos):
    """Items a design puts on coder-negatives (at least MIN_PER_STRATUM, else the stratum variance is undefined)."""
    return max(MIN_PER_STRATUM, n_gold - round(n_gold * share_pos))


def estimate(human, neg, pos, n_gold, share_pos, rng):
    """One audit: returns (estimate, se) from a stratified draw with share_pos of the audit on coder-positives."""
    gn, gp = qa.draw("neyman", n_gold, neg, pos, rng, share_pos)
    return qa.stratified(human, neg, pos, gn, gp)


def inclusion_probabilities(neg, pos, n_gold, share_pos):
    """Per-stratum inclusion probability n_s / N_s: the importance weight on an audited item is its inverse."""
    n_neg = min(len(neg), negatives_needed(n_gold, share_pos))
    n_pos = min(len(pos), max(MIN_PER_STRATUM, round(n_gold * share_pos)))
    return n_neg / len(neg), n_pos / len(pos)

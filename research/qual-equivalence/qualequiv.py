"""Equivalence-gated trust: use a coder's labels as they are only if a hand-coded audit shows its prevalence bias
is inside a stated tolerance (a TOST test), else apply the prediction-powered correction.

Stdlib only. Builds on ../qual-gate (the difference-test gate) and ../qual-correction (the estimators).
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-gate"))
import qualgate as g  # noqa: E402

q = g.q
Z90 = 1.6448536269514722  # one-sided 5% critical value: TOST at level 0.05 = a 90% interval inside (-delta, delta)


def diffs(llm_gold, human_gold):
    return [h - f for h, f in zip(human_gold, llm_gold)]


def equivalent(llm_gold, human_gold, delta):
    """TOST: both one-sided tests reject at 5% iff the 90% interval of the mean human-minus-coder difference lies
    inside (-delta, delta). Returns False when the pairs never disagree and the sample is too small to say."""
    d = diffs(llm_gold, human_gold)
    if len(d) < 2:
        raise ValueError("need at least two hand-coded items")
    se = math.sqrt(q.var(d) / len(d))
    m = q.mean(d)
    return m - Z90 * se > -delta and m + Z90 * se < delta


def gated_equiv(llm_all, llm_gold, human_gold, delta):
    """Naive estimate if the audit shows equivalence within delta, else the prediction-powered one.
    Returns (estimate, se, used_correction)."""
    if equivalent(llm_gold, human_gold, delta):
        e, s = q.naive(llm_all)
        return e, s, False
    e, s = q.ppi(llm_all, llm_gold, human_gold)
    return e, s, True


def split_gated(llm_all, llm_gold, human_gold, z=q.Z95):
    """Sample-splitting variant: the first half of the hand-coded sample picks the estimator (the difference test
    of qual-gate), the second half alone is used for the correction if one is chosen."""
    h = len(human_gold) // 2
    if abs(g.bias_z(llm_gold[:h], human_gold[:h])) > z:
        e, s = q.ppi(llm_all, llm_gold[h:], human_gold[h:])
        return e, s, True
    e, s = q.naive(llm_all)
    return e, s, False


def tost_audit_size(sd_diff, delta, true_bias=0.0):
    """Hand-coded items at which a TOST of tolerance delta has about 50% power to pass when the coder's true bias
    is true_bias: n = (Z90 * sd / (delta - |bias|))^2. Infinite if the bias is outside the tolerance."""
    room = delta - abs(true_bias)
    return math.inf if room <= 0 else (Z90 * sd_diff / room) ** 2

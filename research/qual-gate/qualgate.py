"""Audit-then-trust: use a coder's labels as they are when a hand-coded audit finds no bias, else correct them.

Stdlib only. Reuses the estimators of ../qual-correction (via ../qual-real). The gate is a pre-test, so the
estimator it produces is a mixture of the naive and the prediction-powered estimate.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-real"))
import qualreal as r  # noqa: E402

q = r.q


def bias_z(llm_gold, human_gold):
    """z statistic for 'the coder's prevalence equals the humans' on the hand-coded sample': the mean
    human-minus-coder difference over its paired standard error; 0 when the pairs never disagree."""
    d = [h - f for h, f in zip(human_gold, llm_gold)]
    if len(d) < 2:
        raise ValueError("need at least two hand-coded items")
    v = q.var(d)
    return 0.0 if v == 0 else q.mean(d) / math.sqrt(v / len(d))


def gated(llm_all, llm_gold, human_gold, z=q.Z95):
    """Naive estimate if the audit finds no bias at level z, else the prediction-powered one.
    Returns (estimate, se, used_correction)."""
    if abs(bias_z(llm_gold, human_gold)) > z:
        e, s = q.ppi(llm_all, llm_gold, human_gold)
        return e, s, True
    e, s = q.naive(llm_all)
    return e, s, False


def threshold_coder(scores, human, share_ratio):
    """Code 1 for the top `share_ratio` x (human prevalence) of items by score: a coder whose prevalence is
    biased by a known factor while its ranking stays the same."""
    n = len(scores)
    k = max(0, min(n, round(share_ratio * sum(human))))
    cut = sorted(scores, reverse=True)[k - 1] if k else math.inf
    return [int(s >= cut) for s in scores]

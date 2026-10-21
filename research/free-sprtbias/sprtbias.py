"""How a twin-to-real optimism bias changes the certificate of a rollout test. Pure stdlib; imports the exact SPRT and
fixed-test pieces of the sibling project free-sprtcert.

Model: the policy's real failure rate is p. The twin's failure rate is q = p * r, with r the twin's optimism ratio
(r < 1: the twin fails less often than reality). The test sees only twin rollouts, so P(certify) = P(test accepts | q).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "free-sprtcert"))
from sprtcert import sprt, fixed_n, accept_prob_fixed  # noqa: E402


def false_certify(p_real, r, p0, p1, alpha, beta, kind):
    """P(certify) when the real rate is p_real and the twin runs at p_real * r. kind: 'fixed' or 'sprt'."""
    q = p_real * r
    if kind == "fixed":
        n, c = fixed_n(p0, p1, alpha, beta)
        return accept_prob_fixed(n, c, q)
    return sprt(q, p0, p1, alpha, beta, nmax=20 * fixed_n(p0, p1, alpha, beta)[0])["accept"]


def tolerated_ratio(level, p0, p1, alpha, beta, kind, lo=0.05, hi=1.0, iters=40):
    """Smallest r in [lo, 1] with P(certify | real = p0, twin = p0 * r) <= level (bisection; certify prob rises as r falls)."""
    if false_certify(p0, lo, p0, p1, alpha, beta, kind) <= level:
        return lo
    a, b = lo, hi  # false-certify(a) > level >= false-certify(b)
    for _ in range(iters):
        m = (a + b) / 2
        if false_certify(p0, m, p0, p1, alpha, beta, kind) <= level:
            b = m
        else:
            a = m
    return b


def derated_size(R, p0, p1, alpha, beta):
    """Fixed-test size when p0 is replaced by p0 / R (R >= 1 is the largest optimism factor to guard against).
    Returns (n, c) or None if p0 / R <= p1 (no test can separate them)."""
    if p0 / R <= p1:
        return None
    return fixed_n(p0 / R, p1, alpha, beta)

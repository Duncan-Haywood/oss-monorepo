"""Stopping-time distribution and truncation of Wald's SPRT for certifying a failure rate.

Pure standard library; imports the exact SPRT pieces from the sibling project `free-sprtcert`.
Everything is an exact dynamic programme over (trials n, failures k). Convention as in free-sprtcert:
H0 is the unacceptable rate p0, H1 the acceptable p1 < p0, and "accept" means deciding H1.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "free-sprtcert"))
from sprtcert import log_lr, wald_bounds  # noqa: E402


def stopping_law(p, p0, p1, alpha, beta, cap):
    """Exact law of the SPRT truncated at `cap` trials when the true failure rate is p.

    Stop early when the log likelihood ratio crosses a Wald boundary. If still running after `cap` trials,
    decide by the sign of the log likelihood ratio (accept H1 if it is positive), the usual truncation rule.
    Returns dict: stop (list, stop[n] = P(stop exactly at trial n), n = 1..cap, index 0 unused),
    accept (P(decide H1) including truncated runs), truncated (P(reach the cap undecided)).
    """
    lo, hi = wald_bounds(alpha, beta)
    dist = {0: 1.0}
    stop = [0.0] * (cap + 1)
    acc = 0.0
    for n in range(cap):
        nxt = {}
        for k, m in dist.items():
            for kk, pr in ((k, 1 - p), (k + 1, p)):
                w = m * pr
                if w == 0.0:
                    continue
                s = log_lr(n + 1, kk, p0, p1)
                if s >= hi:
                    acc += w
                    stop[n + 1] += w
                elif s <= lo:
                    stop[n + 1] += w
                else:
                    nxt[kk] = nxt.get(kk, 0.0) + w
        dist = nxt
        if not dist:
            break
    truncated = sum(dist.values())
    for k, m in dist.items():
        if log_lr(cap, k, p0, p1) > 0:
            acc += m
    stop[cap] += truncated
    return {"stop": stop, "accept": acc, "truncated": truncated}


def quantile(stop, q):
    """Smallest n with P(N <= n) >= q."""
    c = 0.0
    for n, w in enumerate(stop):
        c += w
        if c >= q:
            return n
    return len(stop) - 1


def mean(stop):
    return sum(n * w for n, w in enumerate(stop))


def tail(stop, n):
    """P(N > n)."""
    return 1.0 - sum(stop[: n + 1])

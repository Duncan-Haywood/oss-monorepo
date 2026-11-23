"""Verifier bribery: the bribe floor found by bisection on payoffs, and the closed forms."""
from dataclasses import dataclass

__all__ = ["Bribery", "payoffs", "floor_numeric", "floor_closed", "collusion_proof_stake"]


@dataclass(frozen=True)
class Bribery:
    s: float = 1.0
    S: float = 4.0
    lam: float = 0.5
    k: float = 0.5
    h: float = 0.0
    m: int = 1
    phi: float = 0.0   # planted-fault rate
    J: float = 0.0     # jackpot for reporting a planted fault


def payoffs(g: Bribery, x, b):
    """(accept the bribe and stay silent, check and report) per task, others silent."""
    real = (1 - g.phi) * x
    return real * (b - g.h), real * g.lam * g.S + g.phi * g.J - g.k


def floor_numeric(g: Bribery, x, hi=1e9):
    """Smallest bribe at which silence is a best response, by bisection on `payoffs`."""
    a, c = payoffs(g, x, 0.0)
    if a >= c:
        return 0.0
    lo = 0.0
    for _ in range(200):
        mid = (lo + hi) / 2
        a, c = payoffs(g, x, mid)
        if a >= c:
            hi = mid
        else:
            lo = mid
    return hi


def floor_closed(g: Bribery, x):
    """lam S + h + (phi J - k) / ((1 - phi) x)."""
    return g.lam * g.S + g.h + (g.phi * g.J - g.k) / ((1 - g.phi) * x)


def collusion_proof_stake(g: Bribery):
    """Least stake beyond which bribing all m verifiers cannot push cheating to rate 1.

    Two conditions must both hold: bribing all m verifiers costs more than the saving (this stake falls as 1/m),
    and checking pays at all when the solver always cheats, (1 - phi)(lam S + h) > k - phi J. Below the second
    stake the verifiers stay silent unbribed whatever m is, so the threshold is the larger of the two (the
    verifier-bribery project's quality-audit correction of 2026-11-13, ported here)."""
    bonus = max(0.0, g.m * (g.phi * g.J - g.k) / (1 - g.phi))
    bribe = ((g.s - bonus) / g.m - g.h) / g.lam
    checking_pays = ((g.k - g.phi * g.J) / (1 - g.phi) - g.h) / g.lam
    return max(0.0, bribe, checking_pays)

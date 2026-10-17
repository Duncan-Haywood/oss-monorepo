"""Bribery of verifiers in optimistic/refereed verification (stdlib only).

Per task the solver really cheats w.p. x (saves s, loses stake S if reported).
With prob phi the protocol plants a fault instead (forced error); a verifier who
checks sees a discrepancy in both cases and cannot tell them apart.  Reporting
pays lam*S on a real cheat and J on a planted fault; checking costs k; an
unreported real cheat costs every verifier harm h.  The solver may offer each
of the m verifiers a bribe b, paid only on real cheats that go unreported.

Verifier i, given the others stay silent, compares (per task)
  accept  (do not check, take bribe):  (1-phi) x (b - h)
  honest  (check, report):             (1-phi) x lam S + phi J - k
(a reported cheat is slashed, so the reporter bears no harm).  With b=0, phi=0
indifference gives x = k/(lam S + h), the inspection-game cheat rate.
"""
from dataclasses import dataclass
import random


@dataclass(frozen=True)
class Params:
    s: float = 1.0     # solver's saving from a real cheat
    S: float = 4.0     # stake
    lam: float = 0.5   # share of stake paid to the reporting verifier
    k: float = 0.5     # cost of checking
    h: float = 0.0     # harm to a verifier from an unreported cheat
    m: int = 1         # number of verifiers that must all be bribed
    phi: float = 0.0   # planted-fault rate
    J: float = 0.0     # jackpot for reporting a planted fault


def verifier_payoffs(p: Params, x: float, b: float):
    """(accept, honest) expected payoffs for one verifier, others silent."""
    real = (1 - p.phi) * x
    accept = real * (b - p.h)
    honest = real * p.lam * p.S + p.phi * p.J - p.k
    return accept, honest


def bribe_floor(p: Params, x: float) -> float:
    """Smallest bribe making silence a best response (may be negative)."""
    real = (1 - p.phi) * x
    if real <= 0:
        return float("inf")
    return p.lam * p.S + p.h + (p.phi * p.J - p.k) / real


def _profit(p, x, b):
    return x * (p.s - p.m * b)


def solver_profit_closed_form(p: Params) -> float:
    """Max over cheat rate x in (0,1] of x(s - m b*(x)^+), bribes at the floor."""
    A = p.m * (p.lam * p.S + p.h)
    C = p.m * (p.k - p.phi * p.J) / (1 - p.phi)   # sign: >0 means dilemma region
    if C <= 0:                                    # jackpots cover checking
        return max(0.0, p.s - A - (-C))
    if p.s >= A:
        return p.s - A + C if C <= A else p.s   # x = 1 (or free cheating if C>A)
    return p.s * min(1.0, C / A)                # x = C/A: bribes are free there


def solver_profit_bruteforce(p: Params, n: int = 4000) -> float:
    """Independent check: grid over x, bribe set to the floor via verifier_payoffs
    bisection (not via the closed-form floor)."""
    best = 0.0
    for i in range(1, n + 1):
        x = i / n
        lo, hi = 0.0, 1e6
        a, hn = verifier_payoffs(p, x, 0.0)
        if a >= hn:
            b = 0.0
        else:
            for _ in range(80):
                mid = (lo + hi) / 2
                a, hn = verifier_payoffs(p, x, mid)
                if a >= hn:
                    hi = mid
                else:
                    lo = mid
            b = hi
        best = max(best, _profit(p, x, b))
    return best


def collusion_threshold_stake(p: Params) -> float:
    """Smallest stake with s <= m(lam S + h) + m(phi J - k)/(1-phi)^+ : beyond it
    a bribing solver cannot push the cheat rate to 1 (Result 1)."""
    bonus = max(0.0, p.m * (p.phi * p.J - p.k) / (1 - p.phi))
    return max(0.0, ((p.s - bonus) / p.m - p.h) / p.lam)


def simulate_verifier_choice(p: Params, x: float, b: float, tasks: int = 200_000, seed: int = 0):
    """Monte-Carlo mean payoff of (accept, honest) over random tasks."""
    rng = random.Random(seed)
    acc = hon = 0.0
    for _ in range(tasks):
        planted = rng.random() < p.phi
        real = (not planted) and rng.random() < x
        hon += -p.k + (p.lam * p.S if real else 0.0) + (p.J if planted else 0.0)
        acc += (b - p.h) if real else 0.0
    return acc / tasks, hon / tasks

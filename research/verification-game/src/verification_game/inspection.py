"""Inspection game for refereed verification (stdlib only).

Solver: honest (payoff 0) or cheat (saves s if unchecked, loses stake S if caught).
Verifier: check (cost k, earns lam*S from a caught cheat) or skip (suffers harm h
from an accepted bad result). Referee/bisection is assumed to catch every
cheat that is checked (Verde-style refereed delegation).
"""
import math
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class Params:
    s: float          # solver's saving from cheating
    S: float          # solver stake
    k: float          # verifier cost of checking
    lam: float = 0.5  # share of slashed stake paid to the catcher
    h: float = 0.0    # verifier's private harm from an unchecked bad result


def equilibrium(p: Params):
    """Unique mixed equilibrium (cheat rate x, check rate y).

    Verifier indifference: x(lam S + h) = k.  Solver indifference: y = s/(s+S).
    If k > lam S + h checking never pays: cheating is dominant (x=1, y=0).
    """
    if p.k >= p.lam * p.S + p.h:
        return 1.0, 0.0
    return p.k / (p.lam * p.S + p.h), p.s / (p.s + p.S)


def multi_verifier(p: Params, m: int):
    """Symmetric equilibrium with m verifiers; catch reward split among checkers.

    Detection D = s/(s+S) is pinned by the solver's indifference, so each
    verifier checks with y = 1-(1-D)^(1/m). A checker's expected share of the
    reward given a cheat is (1-(1-y)^m)/(m y) = D/(m y), giving
        x = k m y / (lam S D + h m y).
    Returns (cheat rate, per-verifier check rate, total expected check cost).
    """
    D = p.s / (p.s + p.S)
    y = 1 - (1 - D) ** (1 / m)
    x = p.k * m * y / (p.lam * p.S * D + p.h * m * y)
    return min(x, 1.0), y, m * y * p.k


def jackpot_budget(p: Params, eps: float, phi: float = 0.05):
    """Per-task planted-fault subsidy phi*J needed so a lone verifier always
    checks while cheating stays <= eps (Truebit-style forced errors).

    Checking beats skipping iff phi J + (1-phi) x (lam S + h) >= k.
    Returns the minimal expected jackpot spend phi*J (>=0).
    """
    return max(0.0, p.k - (1 - phi) * eps * (p.lam * p.S + p.h))


def fictitious_play(p: Params, rounds: int = 200000, seed: int = 0):
    """Fictitious play; returns empirical (cheat freq, check freq).

    Both players best-respond to the opponent's empirical mixture (ties
    randomised). Converges to the mixed equilibrium in time-average.
    """
    rng = random.Random(seed)
    cheats, checks = 1, 1
    for t in range(1, rounds + 1):
        xh, yh = cheats / (t + 1), checks / (t + 1)
        cheat_gain = (1 - yh) * p.s - yh * p.S
        cheat = cheat_gain > 0 or (cheat_gain == 0 and rng.random() < .5)
        check_gain = xh * (p.lam * p.S + p.h) - p.k
        check = check_gain > 0 or (check_gain == 0 and rng.random() < .5)
        cheats += cheat
        checks += check
    return cheats / (rounds + 1), checks / (rounds + 1)

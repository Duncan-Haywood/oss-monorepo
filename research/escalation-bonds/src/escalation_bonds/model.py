"""Bond-escalation dispute games: a challenger C against an honest defender D, with a fallible final oracle.

Rounds r = 1..R. Bond r is b_r = b * gamma**(r-1); C posts the odd bonds (the first is the challenge), D the even
ones. A player who declines to post on their turn folds: they forfeit every bond they posted and the opponent wins.
If all R bonds are posted an oracle rules, wrongly in C's favour with probability eps (D is honest).
Payoffs are relative to no challenge: C wins +V + (D's posted), C loses -(C's posted);
D wins +(C's posted), D loses -V - (D's posted). Budgets BC, BD cap each side's cumulative posted bonds.
Ties are broken toward folding (conservative for deterrence). Solved exactly by backward induction.
"""
from functools import lru_cache
from itertools import product

__all__ = ["bond", "totals", "solve", "challenges", "deterrence_bond", "deterrence_bond_search", "oracle_payoff_C",
           "attacker_outlays", "defender_safe_budget", "attacker_wins_budget_race", "opening_bond",
           "lockup_cost", "griefing_ratio", "nash_outcomes_stop_round", "stop_round_payoffs", "best_gamma"]

INF = float("inf")


def bond(b, gamma, r):
    return b * gamma ** (r - 1)


def totals(b, gamma, R):
    """(total C posts, total D posts) if all R bonds are posted; C posts odd rounds, D even."""
    return (sum(bond(b, gamma, r) for r in range(1, R + 1, 2)),
            sum(bond(b, gamma, r) for r in range(2, R + 1, 2)))


def oracle_payoff_C(V, eps, PC, PD):
    """C's expected payoff when the oracle rules with C having posted PC and D having posted PD."""
    return eps * (V + PD) - (1 - eps) * PC


def _oracle_payoff_D(V, eps, PC, PD):
    return -eps * (V + PD) + (1 - eps) * PC


def solve(V, eps, b, gamma, R, BC=INF, BD=INF):
    """Subgame-perfect play. Returns (uC, uD, path); path lists 'post'/'fold' along the equilibrium path, C's decision
    to open (post the round-1 bond) included."""
    bonds = [bond(b, gamma, r) for r in range(1, R + 1)]

    @lru_cache(maxsize=None)
    def go(r, PC, PD):
        if r > R:
            return (oracle_payoff_C(V, eps, PC, PD), _oracle_payoff_D(V, eps, PC, PD), ())
        if r % 2 == 1:
            fold = (-PC, PC, ("fold",))
            if PC + bonds[r - 1] > BC + 1e-12:
                return fold
            cont = go(r + 1, PC + bonds[r - 1], PD)
            return (cont[0], cont[1], ("post",) + cont[2]) if cont[0] > fold[0] + 1e-12 else fold
        fold = (V + PD, -V - PD, ("fold",))
        if PD + bonds[r - 1] > BD + 1e-12:
            return fold
        cont = go(r + 1, PC, PD + bonds[r - 1])
        return (cont[0], cont[1], ("post",) + cont[2]) if cont[1] > fold[1] + 1e-12 else fold

    return go(1, 0.0, 0.0)


def challenges(V, eps, b, gamma, R, BC=INF, BD=INF):
    """Does C open a dispute in equilibrium?"""
    return solve(V, eps, b, gamma, R, BC, BD)[2][:1] == ("post",)


def deterrence_bond(V, eps, gamma, R):
    """Largest opening bond at which C still challenges an honest defender with unlimited budgets:
    b* = eps V / ((1-eps) c - eps d), with c, d the unit-b totals of C's and D's bonds at full escalation.
    C challenges iff b < b*; returns inf if (1-eps)c <= eps d (no bond deters). Exact for eps below the
    threshold where D itself would fold; see tests."""
    c, d = totals(1.0, gamma, R)
    den = (1 - eps) * c - eps * d
    return INF if den <= 0 else eps * V / den


def deterrence_bond_search(V, eps, gamma, R, BC=INF, BD=INF):
    """Numerical b* from the exact game (bisection on the equilibrium decision)."""
    lo, hi = 1e-9, 1e9
    if not challenges(V, eps, lo, gamma, R, BC, BD):
        return 0.0
    if challenges(V, eps, hi, gamma, R, BC, BD):
        return INF
    for _ in range(100):
        mid = (lo * hi) ** 0.5
        lo, hi = (mid, hi) if challenges(V, eps, mid, gamma, R, BC, BD) else (lo, mid)
    return lo


def attacker_outlays(b, gamma, R):
    """Cumulative outlay C has made after each of its bonds that leaves D to move (odd r <= R-1), as (r, outlay)."""
    out, tot = [], 0.0
    for r in range(1, R, 2):
        tot += bond(b, gamma, r)
        out.append((r, tot))
    return out


def attacker_wins_budget_race(b, gamma, R, BC, BD):
    """Closed form for eps=0 (C wins only by exhausting D): some odd r <= R-1 with C(r) <= BC and D(r+1) > BD.
    Since D(r+1) = gamma * C(r), this is  gamma * max{C(r) <= BC} > BD."""
    return any(c <= BC + 1e-12 and gamma * c > BD + 1e-12 for _, c in attacker_outlays(b, gamma, R))


def defender_safe_budget(b, gamma, R, BC):
    """Smallest defender budget that survives an attacker with capital BC (eps=0): gamma * C+(BC), where C+ is the
    largest attacker outlay <= BC reachable before round R. At most gamma * BC."""
    reach = [c for _, c in attacker_outlays(b, gamma, R) if c <= BC + 1e-12]
    return gamma * max(reach) if reach else 0.0


def opening_bond(PC_total, gamma, R):
    """Opening bond b giving C a total outlay PC_total at full escalation."""
    c, _ = totals(1.0, gamma, R)
    return PC_total / c


def lockup_cost(b, gamma, R, rate):
    """Capital cost D bears in a dispute it wins: bond j is locked from its posting to the ruling at R*T, so
    (R-j+1) periods, interest `rate` per period; returns (defender cost, challenger's interest cost)."""
    d = sum(bond(b, gamma, j) * (R - j + 1) for j in range(2, R + 1, 2)) * rate
    c = sum(bond(b, gamma, j) * (R - j + 1) for j in range(1, R + 1, 2)) * rate
    return d, c


def griefing_ratio(b, gamma, R, rate, eps):
    """D's lock-up cost divided by C's expected loss (forfeited bonds plus own lock-up), conditioned on a false
    challenge that reaches the oracle."""
    d, c = lockup_cost(b, gamma, R, rate)
    PC, _ = totals(b, gamma, R)
    return d / ((1 - eps) * PC + c)


# ---- independent check: strategic form with stop-round strategies -------------------------------------------------
def stop_round_payoffs(V, eps, b, gamma, R, sC, sD, BC=INF, BD=INF):
    """Payoffs when C posts at odd rounds r < sC and folds at r = sC (sC odd, or R+1..inf for never), D posts at
    even rounds r < sD and folds at sD. Play stops at the first fold, or budget failure, or the oracle."""
    PC = PD = 0.0
    for r in range(1, R + 1):
        bnd = bond(b, gamma, r)
        if r % 2 == 1:
            if r >= sC or PC + bnd > BC + 1e-12:
                return (-PC, PC)
            PC += bnd
        else:
            if r >= sD or PD + bnd > BD + 1e-12:
                return (V + PD, -V - PD)
            PD += bnd
    return (oracle_payoff_C(V, eps, PC, PD), _oracle_payoff_D(V, eps, PC, PD))


def nash_outcomes_stop_round(V, eps, b, gamma, R, BC=INF, BD=INF):
    """All pure Nash equilibria (as payoff pairs) of the stop-round strategic form."""
    sCs = list(range(1, R + 2, 2)) + [R + 1]
    sDs = list(range(2, R + 2, 2)) + [R + 1]
    sCs, sDs = sorted(set(sCs)), sorted(set(sDs))
    pay = {(x, y): stop_round_payoffs(V, eps, b, gamma, R, x, y, BC, BD) for x, y in product(sCs, sDs)}
    res = []
    for (x, y), (uc, ud) in pay.items():
        if all(pay[(x2, y)][0] <= uc + 1e-9 for x2 in sCs) and all(pay[(x, y2)][1] <= ud + 1e-9 for y2 in sDs):
            res.append((uc, ud))
    return res


def best_gamma(PC_total, b_open, R_max_cost, lam_capital, lam_time, gammas):
    """Choose gamma minimising lam_capital * gamma * PC_total + lam_time * R(gamma), where R(gamma) is the smallest odd
    number of rounds whose opening bond for total outlay PC_total does not exceed b_open. Returns (gamma, R, cost)."""
    best = None
    for g in gammas:
        R = next((r for r in range(1, R_max_cost + 1, 2) if opening_bond(PC_total, g, r) <= b_open), None)
        if R is None:
            continue
        cost = lam_capital * g * PC_total + lam_time * R
        if best is None or cost < best[2]:
            best = (g, R, cost)
    return best

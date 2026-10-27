"""Replicated workers on one job, one shared cheap trajectory, one audit: strong-equilibrium search by brute force.

Each of m workers submits honest (0, cost 1) or the shared cheat (1, cost 1 - g). The strict-majority output is
accepted and its submitters are paid r; every other submitter (or everyone, with no strict majority) gets -S.
One audit per job (probability p) catches the cheat; then every cheat submitter gets -S."""
from itertools import product

__all__ = ["utilities", "strong_equilibrium", "min_stake", "stake_closed", "stake_closed_het"]


def utilities(profile, g, p, S, r=1.0):  # g: a number, or one saving per worker
    """Expected utility of each worker for a 0/1 profile (1 = cheat). The audit enters linearly, so one audit per
    job and one independent audit per worker give the same expected utility."""
    m = len(profile)
    k = sum(profile)
    gs = list(g) if hasattr(g, "__len__") else [g] * m
    out = []
    for i, a in enumerate(profile):
        cost = 1.0 - gs[i] if a else 1.0
        if k * 2 > m:          # cheats are the strict majority
            pay = (1 - p) * r + p * (-S) if a else -S
        elif (m - k) * 2 > m:  # honest are the strict majority
            pay = -S if a else r
        else:                  # tie: no accepted output
            pay = -S
        out.append(pay - cost)
    return out


def strong_equilibrium(m, g, p, S, r=1.0, margin=0.0, target=None, transfers=False):
    """True if no subset of workers has a joint deviation that leaves every member better off by more than margin.
    transfers=True: members can split gains, so a deviation counts when their summed gain exceeds margin * size."""
    base = tuple(target or (0,) * m)
    u0 = utilities(base, g, p, S, r)
    for mask in range(1, 2 ** m):
        members = [i for i in range(m) if mask >> i & 1]
        for acts in product((0, 1), repeat=len(members)):
            prof = list(base)
            for i, a in zip(members, acts):
                prof[i] = a
            if tuple(prof) == base:
                continue
            u = utilities(prof, g, p, S, r)
            if transfers:
                if sum(u[i] - u0[i] for i in members) > margin * len(members):
                    return False
            elif all(u[i] > u0[i] + margin for i in members):
                return False
    return True


def min_stake(m, g, p, r=1.0, hi=1e6, tol=1e-9, transfers=False):
    """Least stake S >= 0 at which all-honest is a strong equilibrium, by bisection (monotone in S)."""
    if strong_equilibrium(m, g, p, 0.0, r, transfers=transfers):
        return 0.0
    if not strong_equilibrium(m, g, p, hi, r, transfers=transfers):
        return float("inf")
    lo = 0.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if strong_equilibrium(m, g, p, mid, r, transfers=transfers):
            hi = mid
        else:
            lo = mid
    return hi


def stake_closed(m, g, p, r=1.0):
    """max(0, g / p - r), independent of m (the audit is the only check a coordinating majority faces)."""
    return max(0.0, g / p - r)


def stake_closed_het(gs, p, r=1.0, transfers=False):
    """Heterogeneous savings gs. Majority k = floor(m/2)+1 of cheaters is the least that escapes replication.
    Without transfers every member must gain: the k-th largest saving decides. With transfers the summed gain
    decides: the mean of the k largest savings."""
    m = len(gs)
    top = sorted(gs, reverse=True)[: m // 2 + 1]
    g = sum(top) / len(top) if transfers else top[-1]
    return max(0.0, g / p - r)

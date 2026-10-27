"""Replicated workers on one job, one shared cheap trajectory, one audit: strong-equilibrium search by brute force.

Each of m workers submits honest (0, cost 1) or the shared cheat (1, cost 1 - g). The strict-majority output is
accepted and its submitters are paid r; every other submitter (or everyone, with no strict majority) gets -S.
One audit per job (probability p) catches the cheat; then every cheat submitter gets -S."""
from itertools import product

__all__ = ["utilities", "strong_equilibrium", "min_stake", "stake_closed", "stake_closed_het",
           "utilities_aud", "strong_equilibrium_aud", "min_bond", "bond_closed"]


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


# --- Milestone 34: an auditor who can join the coalition -------------------------------------------------------
def utilities_aud(profile, aud, g, p, S, q, B, r=1.0):
    """As `utilities`, plus an auditor. aud = 0 reports what it finds, 1 colludes (reports clean). When cheaters are
    the strict majority the audit (probability p) catches them if the auditor is honest. A colluding auditor is
    exposed by a meta-audit with probability q, which forfeits its bond B and the cheaters' stake S. An auditor paid
    only for catches earns 0 in the all-honest profile whatever it does, so its reward cannot deter it: the bond does.
    Returns (worker utilities, auditor utility). Bribes are transfers inside the coalition."""
    m, k = len(profile), sum(profile)
    gs = list(g) if hasattr(g, "__len__") else [g] * m
    cheat_accepted = k * 2 > m
    miss = (q if aud else p) if cheat_accepted else 0.0  # probability the cheaters are caught
    out = []
    for i, a in enumerate(profile):
        cost = 1.0 - gs[i] if a else 1.0
        if cheat_accepted:
            pay = r - miss * (r + S) if a else -S
        elif (m - k) * 2 > m:
            pay = -S if a else r
        else:
            pay = -S
        out.append(pay - cost)
    return out, (-q * B if (aud and cheat_accepted) else 0.0)


def strong_equilibrium_aud(m, g, p, S, q, B, r=1.0):
    """All-honest with an honest auditor survives every joint deviation of any subset of the m workers and the
    auditor in which the members' summed gain (transfers allowed) is positive."""
    u0, a0 = utilities_aud((0,) * m, 0, g, p, S, q, B, r)
    for mask in range(1, 2 ** (m + 1)):
        members = [i for i in range(m + 1) if mask >> i & 1]
        for acts in product((0, 1), repeat=len(members)):
            prof, aud = [0] * m, 0
            for i, a in zip(members, acts):
                if i == m:
                    aud = a
                else:
                    prof[i] = a
            if not any(acts):
                continue
            u, au = utilities_aud(prof, aud, g, p, S, q, B, r)
            gain = sum(u[i] - u0[i] for i in members if i < m) + ((au - a0) if m in members else 0.0)
            if gain > 1e-12:
                return False
    return True


def min_bond(m, g, p, S, q, r=1.0, hi=1e4, tol=1e-9):
    """Least auditor bond B at which the all-honest profile is a strong equilibrium including the auditor, by
    bisection. inf when workers alone can deviate at this stake (no bond helps)."""
    if strong_equilibrium_aud(m, g, p, S, q, 0.0, r):
        return 0.0
    if not strong_equilibrium_aud(m, g, p, S, q, hi, r):
        return float("inf")
    lo = 0.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if strong_equilibrium_aud(m, g, p, S, q, mid, r) else (mid, hi)
    return hi


def bond_closed(gs, S, q, r=1.0):
    """The bond that deters the best coalition including the auditor, k = floor(m/2)+1: the k largest savings are
    needed to escape replication, and every further worker joins when its saving exceeds the meta-audit's expected
    take q (r + S). B = max(0, sum of those net gains) / q."""
    gs = sorted(gs, reverse=True)
    k, t = len(gs) // 2 + 1, q * (r + S)
    return max(0.0, (sum(g - t for g in gs[:k]) + sum(max(0.0, g - t) for g in gs[k:])) / q)

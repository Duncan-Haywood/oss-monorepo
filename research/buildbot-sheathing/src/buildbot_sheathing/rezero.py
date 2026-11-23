"""Re-zero scheduling for a drifting wrist force/torque bias (milestone 72).

Milestone 71 gave every press pose a drift allowance a (N): the bias may wander by up to a since
the last re-zero and the press stays inside the 0.03 mm spec. With the drift linear in time at
rate rho (N/h), a press at elapsed time E (s) after the last re-zero is certified while

    E <= T = 3600 a / rho.

A work list is a sequence of presses. Press m has a gap g_m of non-press time before it (sheet
placement, stud reads) and a duration tau; it is checked at its end. A re-zero inserted before
press i (after its gap) resets the clock, so the elapsed time from a re-zero before press i to the
end of press m >= i is

    E(i, m) = tau_i + sum_{j=i+1..m} (g_j + tau_j),

which does not depend on the re-zero's own duration. The segment [i, m] is feasible when
E(i, m') <= T_m' for every m' in it. E(i', m) <= E(i, m) for i' >= i, so a segment that is feasible
from i stays feasible from any later start: feasibility is monotone in the start.

`greedy` re-zeros as late as possible (just before the first press that would break its
deadline). By the monotonicity it is optimal for a fixed order: if any feasible schedule has its
k-th re-zero before press o_k, greedy's k-th is at or after o_k (induction on k: greedy's segment
from g_{k-1} >= o_{k-1} reaches at least as far as the other schedule's), so greedy never needs
more re-zeros. `brute_force` checks this on small instances.
"""
from itertools import combinations

import numpy as np

from .budget import EDGE, HEIGHT, IN, Z_FIELD, Z_JOINT

# the 62 nails of a 4x8 sheet (budget.py): x along the wall (m), z up the sheet (m)
JOINT_X = (0.0, 48 * IN)
FIELD_X = (16 * IN, 32 * IN)
PLATE_X = tuple(k * 6 * IN for k in range(1, 8))       # 7 per plate, between the joint studs
PLATE_Z = (EDGE, HEIGHT - EDGE)                       # assumption: plate nails at the edge distance


def sheet_nails():
    """(x, z) of the 62 nails, metres."""
    out = [(x, float(z)) for x in JOINT_X for z in Z_JOINT]
    out += [(x, float(z)) for x in FIELD_X for z in Z_FIELD]
    out += [(x, z) for x in PLATE_X for z in PLATE_Z]
    assert len(out) == 62
    return out


def elapsed(gaps, taus, i, m):
    return taus[i] + sum(gaps[j] + taus[j] for j in range(i + 1, m + 1))


def greedy(gaps, taus, T):
    """Re-zero positions (press indices) as late as possible; an initial re-zero before press 0 is
    implied and not counted. None if some press cannot be certified even right after a re-zero.
    Each press is checked once, at its own end, against its own deadline."""
    gaps, taus, T = (np.asarray(v, float) for v in (gaps, taus, T))
    if np.any(taus > T + 1e-12):
        return None
    starts, e = [], 0.0
    for m in range(len(T)):
        e = taus[m] if m == 0 else e + gaps[m] + taus[m]
        if e > T[m] + 1e-12:
            starts.append(m)
            e = taus[m]
    return starts


def feasible(gaps, taus, T, starts):
    cut = set(starts)
    e = None
    for m in range(len(T)):
        e = taus[m] if (m == 0 or m in cut) else e + gaps[m] + taus[m]
        if e > T[m] + 1e-12:
            return False
    return True


def brute_force(gaps, taus, T):
    """Fewest re-zeros over every subset of positions 1..n-1 (small n only). None if infeasible."""
    n = len(T)
    for k in range(n):
        for c in combinations(range(1, n), k):
            if feasible(gaps, taus, T, c):
                return k
    return None


def fixed_interval(gaps, taus, Tfix):
    """A clock schedule: re-zero before any press that would end more than Tfix after the last
    re-zero, whatever the press's own allowance (milestone 71's table read as one interval)."""
    return greedy(gaps, taus, np.full(len(taus), float(Tfix)))

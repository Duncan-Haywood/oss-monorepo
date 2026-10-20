"""Dense re-check of a trapezoid carry and an a-posteriori bound on the peak a sampled check can miss.

trap.move samples the torque and the jaw force at n + 1 whole-move midpoints plus a few extra samples inside each ramp.
Here the same load is evaluated on a much denser grid, so the trapezoid's duration can be re-found with (almost) every peak
inside the check, and the leftover gap between samples is bounded.
"""
import math

from . import trap
from .model import G


def utilisation(arm, qa, qb, T, f, tau_max, mass, fcap, xs, mu=0.5, h=1e-5):
    """max(|tau_1|, |tau_2|) / tau_max and the jaw force / fcap (fcap None = no cap) at each x = t/T in xs, as (x, u) sorted by x."""
    dq = (qb[0] - qa[0], qb[1] - qa[1])
    out = []
    for x in sorted(xs):
        p, v, a = trap.trap(x, f)
        q = (qa[0] + dq[0] * p, qa[1] + dq[1] * p)
        qd = (dq[0] * v / T, dq[1] * v / T)
        qdd = (dq[0] * a / T ** 2, dq[1] * a / T ** 2)
        t = arm.torque(q, qd, qdd)
        u = max(abs(t[0]), abs(t[1])) / tau_max
        if fcap:
            x0 = arm.fk(q[0] - qd[0] * h, q[1] - qd[1] * h)
            x1 = arm.fk(*q)
            x2 = arm.fk(q[0] + qd[0] * h, q[1] + qd[1] * h)
            cen = [(x2[i] - 2 * x1[i] + x0[i]) / h ** 2 for i in range(2)]
            jac = [[(arm.fk(q[0] + h, q[1])[i] - arm.fk(q[0] - h, q[1])[i]) / (2 * h),
                    (arm.fk(q[0], q[1] + h)[i] - arm.fk(q[0], q[1] - h)[i]) / (2 * h)] for i in range(2)]
            ar = cen[0] + jac[0][0] * qdd[0] + jac[0][1] * qdd[1]
            az = cen[1] + jac[1][0] * qdd[0] + jac[1][1] * qdd[1]
            u = max(u, mass * math.hypot(G + az, ar) / (2 * mu) / fcap)
        out.append((x, u))
    return out


def missed_bound(samples, breaks=()):
    """A-posteriori estimate of how far above max(u) the true peak of the sampled curve can lie. For each gap between neighbouring
    samples: the largest slope seen on that gap or its two neighbouring gaps, times half the gap. The worst gap is reported. Pairs
    that straddle a break (where the acceleration jumps, so the curve does) are left out; the break itself is sampled from both sides
    by dense_points. An estimate from the samples themselves, not a proof."""
    pairs = [(a, b) for a, b in zip(samples, samples[1:]) if b[0] - a[0] > 1e-12 and not any(a[0] <= c <= b[0] for c in breaks)]
    slope = [abs(b[1] - a[1]) / (b[0] - a[0]) for a, b in pairs]
    worst = 0.0
    for i, (a, b) in enumerate(pairs):
        local = max(slope[max(0, i - 1):i + 2])
        worst = max(worst, local * (b[0] - a[0]) / 2)
    return worst


def dense_points(n, f, ramp_samples):
    """Whole-move midpoints plus extra midpoints in each ramp (trap.sample_points), plus both sides of the two corners x = f and
    x = 1 - f, where the acceleration (and so the torque) jumps; the default sampling only ever lands near a corner."""
    eps = 1e-9
    return trap.sample_points(n, f, ramp_samples) + [f - eps, f + eps, 1 - f - eps, 1 - f + eps]


def peak_util(arm, qa, qb, T, f, tau_max, mass, fcap, n, ramp_samples, mu=0.5):
    s = utilisation(arm, qa, qb, T, f, tau_max, mass, fcap, dense_points(n, f, ramp_samples), mu=mu)
    return max(u for _, u in s), s


def min_time_dense(arm, qa, qb, tau_max, mass, fcap, f, T0, n, ramp_samples, mu=0.5, tol=1e-5, grow=1.05):
    """Shortest duration T >= T0 whose dense check (n whole-move midpoints, ramp_samples per ramp) is within the limits.
    T0 should be the duration found by a coarser check, which is never longer than the dense one in practice
    (searched from 0.9 * T0 to grow * T0: returns None if even grow * T0 fails)."""
    def ok(T):
        return peak_util(arm, qa, qb, T, f, tau_max, mass, fcap, n, ramp_samples, mu)[0] <= 1.0
    lo, hi = T0 * 0.9, T0 * grow
    if ok(lo):
        return lo
    if not ok(hi):
        return None
    while hi - lo > tol * T0:
        mid = 0.5 * (lo + hi)
        if ok(mid):
            hi = mid
        else:
            lo = mid
    return hi

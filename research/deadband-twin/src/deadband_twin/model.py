"""Deadband twin.  Real actuator: dz(u) = u - d*sign(u) for |u| > d, else 0.  Twin actuator: identity (d = 0).

Servo: x+ = x + dz(u), u = -k x, 0 < k <= 1.  For x > d/k the state moves by -(k x - d), so e = x - d/k
contracts by (1-k) each step and x never goes below d/k: the real loop stalls at |x| = d/k, the twin converges to 0.
Excitation fit: for u ~ N(0, s^2), OLS of dz(u) on u has plim P(|u| > d) = 2 Q(d/s) (Stein's lemma).
Deadband compensation with an estimate dh: command v = u + dh*sign(u); residual stall (d-dh)/k if dh<=d, else a period-2 chatter of amplitude (dh-d)/(2-k).
"""
import math
import random


def Q(z):
    return 0.5 * math.erfc(z / math.sqrt(2))


def dz(u, d):
    if u > d:
        return u - d
    if u < -d:
        return u + d
    return 0.0


def stall_error(d, k):
    """Exact resting error of the real loop (twin predicts 0)."""
    return d / k


def run_servo(x0, k, d, steps, dh=0.0):
    """Real loop with optional deadband compensation dh; returns the trajectory."""
    x, xs = x0, [x0]
    for _ in range(steps):
        u = -k * x
        v = u + dh * (1 if u > 0 else -1 if u < 0 else 0)
        x += dz(v, d)
        xs.append(x)
    return xs


def steps_to(x0, k, eps):
    """Twin (d=0) steps until |x| <= eps: x_n = (1-k)^n x0."""
    if abs(x0) <= eps:
        return 0
    return math.ceil(math.log(eps / abs(x0)) / math.log(1 - k))


def gain_gaussian(d, s):
    """Population gain a linear twin fits to dz(u) from Gaussian excitation of std s."""
    return 2 * Q(d / s)


def fit_gain(d, s, n, rng):
    us = [rng.gauss(0, s) for _ in range(n)]
    ys = [dz(u, d) for u in us]
    return sum(u * y for u, y in zip(us, ys)) / sum(u * u for u in us)


def k_needed(d, eps):
    return d / eps


def bisect_deadband(d, lo, hi, n):
    """n real probes: apply command c, observe whether the actuator moved.  Returns (lo+hi)/2 after n halvings."""
    for _ in range(n):
        mid = (lo + hi) / 2
        if dz(mid, d) > 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def bisection_error_bound(lo, hi, n):
    return (hi - lo) / 2 ** (n + 1)


def comp_error(d, dh, k):
    """Exact resting |x|: under-compensation stalls at (d-dh)/k; over-compensation (e=dh-d>0) chatters on the
    period-2 orbit +-e/(2-k)."""
    if dh <= d:
        return (d - dh) / k
    return (dh - d) / (2 - k)

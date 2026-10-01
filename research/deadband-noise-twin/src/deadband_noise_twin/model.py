"""Deadband twin.  Integrator plant x+ = x + f(u), controller u = -K*(x + n), n ~ N(0,s2).
Twin actuator: f(u) = u.  Real actuator: f(u) = deadband(u, d) = sign(u)*max(|u|-d, 0).

Exact facts (noise-free): the real loop is x+ = x - sign(x)*max(K|x| - d, 0), which stalls at |x| = d/K
(geometric approach at rate 1-K) for 0 < K <= 1.  For 1 < K < 2 the iterate overshoots and the stall set is the whole
interval |x| <= d/K, so d/K is only the worst case.  Inverse-deadband compensation with an assumed width dh replaces u by
u + dh*sign(u): dh < d leaves an effective deadband d-dh (stall (d-dh)/K); dh > d chatters in an exact 2-cycle
of amplitude (dh-d)/(2-K).
"""
import math
import random


def deadband(u, d):
    return 0.0 if abs(u) <= d else (u - d if u > 0 else u + d)


def sign(v):
    return (v > 0) - (v < 0)


def stall(K, d):
    """Noise-free stall point of the real loop for 0 < K <= 1 (twin: 0); worst-case stall radius for 1 < K < 2."""
    return d / K


def stall_compensated(K, d, dh):
    """Noise-free residual of inverse-deadband compensation with assumed width dh (0 < K < 1 for the chatter case)."""
    if dh <= d:
        return (d - dh) / K
    return (dh - d) / (2 - K)


def twin_rms(K, s):
    """Stationary rms error of the linear twin: x+ = (1-K) x - K n."""
    return s * math.sqrt(K / (2 - K))


def step(x, K, d, n=0.0, dither=0.0, dh=0.0):
    u = -K * (x + n) + dither
    if dh:
        u += dh * sign(u)
    return x + deadband(u, d)


def trajectory(x0, K, d, steps, dh=0.0):
    x, out = x0, [x0]
    for _ in range(steps):
        x = step(x, K, d, dh=dh)
        out.append(x)
    return out


def steps_to_tol(x0, K, tol, d=0.0, max_steps=10 ** 6):
    """First k with |x_k| <= tol; None if never (real loop stalled above tol)."""
    x = x0
    for k in range(max_steps):
        if abs(x) <= tol:
            return k
        nx = step(x, K, d)
        if nx == x:
            return None
        x = nx
    return None


def twin_steps_to_tol(x0, K, tol):
    if K == 1:
        return 1
    return math.ceil(math.log(abs(x0) / tol) / -math.log(abs(1 - K)))


def stationary_rms(K, d, s, a=0.0, n=200000, burn=2000, seed=1, dh=0.0):
    """Simulated stationary rms error of the real loop with measurement noise s and uniform dither U(-a,a) on u."""
    r = random.Random(seed)
    x, acc, m = 1.0, 0.0, 0
    for k in range(n):
        noise = r.gauss(0, s) if s else 0.0
        dith = r.uniform(-a, a) if a else 0.0
        x = step(x, K, d, noise, dith, dh)
        if k >= burn:
            acc += x * x
            m += 1
    return math.sqrt(acc / m)


def worst_final(K, d, x0s, steps=400):
    """Largest noise-free final |x| over a grid of initial conditions."""
    return max(abs(trajectory(x0, K, d, steps)[-1]) for x0 in x0s)

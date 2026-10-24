"""Chaotic twins integrated at different floating-point precisions (numpy, vectorised over an ensemble).

State arrays have shape (N, 3). Every arithmetic operation runs in the dtype of the state, so a float32 run
rounds like float32 hardware; constants are cast to that dtype too.
"""
import math
import numpy as np

SYSTEMS = {
    # name: (params, default dt, divergence threshold, burn-in time)
    "lorenz": dict(dt=0.01, thr=1.0, burn=20.0),
    "rossler": dict(dt=0.02, thr=1.0, burn=100.0),
}


def deriv(name, s, dtype):
    c = lambda v: dtype(v)
    x, y, z = s[:, 0], s[:, 1], s[:, 2]
    if name == "lorenz":
        d = np.stack([c(10) * (y - x), x * (c(28) - z) - y, x * y - c(8.0 / 3.0) * z], axis=1)
    elif name == "rossler":
        d = np.stack([-y - z, x + c(0.2) * y, c(0.2) + z * (x - c(5.7))], axis=1)
    else:
        raise ValueError(name)
    return d.astype(dtype, copy=False)


def rk4(name, s, dt, dtype):
    h = dtype(dt)
    half = dtype(0.5)
    sixth = dtype(1.0 / 6.0)
    k1 = deriv(name, s, dtype)
    k2 = deriv(name, s + half * h * k1, dtype)
    k3 = deriv(name, s + half * h * k2, dtype)
    k4 = deriv(name, s + h * k3, dtype)
    return (s + h * sixth * (k1 + dtype(2) * k2 + dtype(2) * k3 + k4)).astype(dtype, copy=False)


def initial_states(name, n, seed):
    """n states on (or near) the attractor, found with a float64 burn-in from random starts."""
    rng = np.random.default_rng(seed)
    s = rng.normal(size=(n, 3)) * 2.0 + (np.array([0, 0, 25.0]) if name == "lorenz" else 0.0)
    cfg = SYSTEMS[name]
    for _ in range(int(cfg["burn"] / cfg["dt"])):
        s = rk4(name, s, cfg["dt"], np.float64)
    return s


def run(name, s0, t_end, dtype, every=1):
    """Integrate to t_end; return times and the trajectory (T, N, 3) sampled every `every` steps, as float64."""
    dt = SYSTEMS[name]["dt"]
    n = int(round(t_end / dt))
    s = s0.astype(dtype)
    out = [s.astype(np.float64)]
    ts = [0.0]
    for i in range(1, n + 1):
        s = rk4(name, s, dt, dtype)
        if i % every == 0:
            out.append(s.astype(np.float64))
            ts.append(i * dt)
    return np.array(ts), np.array(out)


def divergence_times(ts, a, b, thr):
    """First sampled time at which |a-b|_2 > thr per ensemble member (nan if never)."""
    d = np.linalg.norm(a - b, axis=2)
    over = d > thr
    first = over.argmax(axis=0)
    t = ts[first].astype(float)
    t[~over.any(axis=0)] = np.nan
    return t


def perturbed(s0, delta, seed):
    """s0 plus a random direction of Euclidean size `delta`."""
    rng = np.random.default_rng(seed)
    u = rng.normal(size=s0.shape)
    u /= np.linalg.norm(u, axis=1, keepdims=True)
    return s0 + delta * u


def lyapunov(name, s0, t_end, dtype, d0=1e-3, seed=0):
    """Benettin two-trajectory estimate of the largest Lyapunov exponent, all arithmetic in `dtype`."""
    dt = SYSTEMS[name]["dt"]
    s = s0.astype(dtype)
    p = perturbed(s0, d0, seed).astype(dtype)
    acc = np.zeros(len(s0))
    every = 10
    steps = int(round(t_end / dt))
    for i in range(1, steps + 1):
        s = rk4(name, s, dt, dtype)
        p = rk4(name, p, dt, dtype)
        if i % every == 0:
            diff = (p - s).astype(dtype)
            dist = np.linalg.norm(diff.astype(np.float64), axis=1)
            acc += np.log(dist / d0)
            p = (s + diff * dtype(d0) / dist.astype(dtype)[:, None]).astype(dtype)
    return acc / (steps * dt)


def long_run_stats(name, s0, t_end, dtype):
    """Per-member time averages over t_end of: z-ish observable, indicator x>0, and lobe-switch rate."""
    dt = SYSTEMS[name]["dt"]
    s = s0.astype(dtype)
    n = int(round(t_end / dt))
    zsum = np.zeros(len(s0))
    pos = np.zeros(len(s0))
    sw = np.zeros(len(s0))
    prev = s[:, 0] > 0
    for _ in range(n):
        s = rk4(name, s, dt, dtype)
        x = s[:, 0].astype(np.float64)
        zsum += s[:, 2].astype(np.float64)
        cur = x > 0
        pos += cur
        sw += cur != prev
        prev = cur
    return zsum / n, pos / n, sw / t_end


def z_stat(a, b):
    """Welch z for the difference of two sample means (independent members)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    se = math.sqrt(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b))
    return (a.mean() - b.mean()) / se if se > 0 else float("nan")

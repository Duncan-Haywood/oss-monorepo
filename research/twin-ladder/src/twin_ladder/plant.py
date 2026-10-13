"""A timestep ladder of twins of one plant: a saturated PD-controlled, mildly nonlinear mass-spring under random disturbance, simulated
with semi-implicit Euler.  Level 0 is the 'real' plant (the finest step, itself a simulation); coarser steps are cheaper twins.
The disturbance is piecewise constant on the finest grid; a coarse step sees the average of the fine values it spans (coupled contexts)."""
import math, random

__all__ = ["NLEVELS", "make_noise", "FINE_DT", "T_END", "LEVEL_STEPS", "make_context", "episode_cost_return"]

FINE_DT, T_END = 1 / 160, 4.0
LEVEL_STEPS = [1, 2, 4, 8, 16, 32]                    # step = LEVEL_STEPS[j] * FINE_DT ; level 0 is the "real" plant
NLEVELS = 5                                           # levels 0..4 are used; level 5 (step 0.2 s) is numerically unstable here (see E5)
KP, KD, KSPR, K3, USAT, SIG = 9.0, 3.0, 1.0, 1.0, 12.0, 6.0


def make_noise(rng):
    return [SIG * rng.gauss(0, 1) / math.sqrt(FINE_DT) for _ in range(int(round(T_END / FINE_DT)))]


def make_context(rng):
    return rng.uniform(-1, 1), rng.uniform(-1, 1), make_noise(rng)


def episode_cost_return(ctx, level, own_noise=None):
    """Return (cost, R): cost = number of steps taken; R = integral of x^2 + 0.05 u^2 over the horizon.
    own_noise: a disturbance sequence for a twin that cannot replay the real disturbance (it shares only the initial state)."""
    x, v, w = ctx
    if own_noise is not None:
        w = own_noise
    s = LEVEL_STEPS[level]
    dt = s * FINE_DT
    R = 0.0
    n = len(w) // s
    for k in range(n):
        wk = sum(w[k * s:(k + 1) * s]) / s if s > 1 else w[k]
        u = -KP * x - KD * v
        u = USAT if u > USAT else (-USAT if u < -USAT else u)
        R += (x * x + 0.05 * u * u) * dt
        v += dt * (u - KSPR * x - K3 * x ** 3 + wk)
        x += dt * v
    return n, R

"""Single-support carry gait with the planned centre of pressure swept along the sole during the step.

`buildbot_carrycop` held the centre of pressure (CoP) at a constant offset from the sole point. A walking human
rolls the CoP from heel to toe during single support. Here the CoP moves linearly from c0 at t = 0 to c1 at
t = T. With p(t) = c0 + (c1 - c0) t / T the linear inverted pendulum (Kajita et al. 2001) obeys
x'' = (g / z) (x - p(t)); because p'' = 0, x = p(t) is a particular solution, so
x(t) = p(t) + A cosh(t/Tc) + B sinh(t/Tc) with Tc = sqrt(z/g), A = -L/2 - c0 and B set by x(T) = L/2.
Everything else (IK, inverse dynamics, scoring) is `buildbot_carryphase`'s, unchanged.
"""
from contextlib import contextmanager

import numpy as np

from buildbot_carryphase import model as C

G = C.G


def lipm_x_ramp(L, T, zc, t, c0=0.0, c1=0.0):
    """COM x relative to the stance sole point at times t, CoP swept c0 -> c1 over [0, T], x(0) = -L/2, x(T) = L/2."""
    Tc = np.sqrt(zc / G)
    t = np.asarray(t, dtype=float)
    p = lambda s: c0 + (c1 - c0) * s / T
    A = -L / 2 - c0
    B = (L / 2 - p(T) - A * np.cosh(T / Tc)) / np.sinh(T / Tc)
    return p(t) + A * np.cosh(t / Tc) + B * np.sinh(t / Tc)


@contextmanager
def cop_ramp(c0, c1):
    saved = C.lipm_x
    C.lipm_x = lambda L, T, zc, t: lipm_x_ramp(L, T, zc, t, c0, c1)
    try:
        yield
    finally:
        C.lipm_x = saved


def score(su, L, T, mass, c0, c1, **kw):
    with cop_ramp(c0, c1):
        return C.score(su, L, T, mass, **kw)

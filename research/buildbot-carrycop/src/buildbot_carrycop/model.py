"""Single-support carry gait with the planned centre of pressure moved off the middle of the sole.

`buildbot_carryphase` plans the combined centre of mass on the linear inverted pendulum orbit with the
centre of pressure (CoP) at the stance sole point (Kajita et al. 2001). Here the CoP is held at a constant
offset c ahead of (c > 0) or behind (c < 0) that point. With the CoP at c the pendulum obeys
x'' = (g / z) (x - c), and the symmetric step still runs from -L/2 to +L/2 relative to the foot. Leaning the
body to move the CoP is what a real walking controller does with its trunk and arms; this is the cheapest
one-parameter version of it, with no controller. Everything else (IK, inverse dynamics, scoring) is
`buildbot_carryphase`'s, unchanged.
"""
from contextlib import contextmanager

import numpy as np

from buildbot_carryphase import model as C

G = C.G


def lipm_x_cop(L, T, zc, t, c=0.0):
    """COM x relative to the stance sole point at times t, orbit with the CoP held at c, x(0) = -L/2, x(T) = L/2."""
    Tc = np.sqrt(zc / G)
    A = -L / 2 - c
    B = (L / 2 - c - A * np.cosh(T / Tc)) / np.sinh(T / Tc)
    return c + A * np.cosh(t / Tc) + B * np.sinh(t / Tc)


@contextmanager
def cop_offset(c):
    """Run buildbot_carryphase's gait with the CoP planned at offset c (m) from the sole point."""
    saved = C.lipm_x
    C.lipm_x = lambda L, T, zc, t: lipm_x_cop(L, T, zc, t, c)
    try:
        yield
    finally:
        C.lipm_x = saved


def score(su, L, T, mass, c, **kw):
    with cop_offset(c):
        return C.score(su, L, T, mass, **kw)


def lipm_x_ramp(L, T, zc, t, c0, c1):
    """COM x with the CoP moving linearly from c0 (t = 0) to c1 (t = T), x(0) = -L/2, x(T) = L/2.

    For c(t) linear, x = c(t) solves x'' = (g / z)(x - c) exactly (both sides are zero), so the orbit is
    c(t) + A cosh(t / Tc) + B sinh(t / Tc) with A and B fixed by the endpoints. c0 = c1 is `lipm_x_cop`."""
    Tc = np.sqrt(zc / G)
    A = -L / 2 - c0
    B = (L / 2 - c1 - A * np.cosh(T / Tc)) / np.sinh(T / Tc)
    return c0 + (c1 - c0) * t / T + A * np.cosh(t / Tc) + B * np.sinh(t / Tc)


@contextmanager
def cop_ramp(c0, c1):
    """Run buildbot_carryphase's gait with the CoP planned to travel from c0 to c1 (m) over the step."""
    saved = C.lipm_x
    C.lipm_x = lambda L, T, zc, t: lipm_x_ramp(L, T, zc, t, c0, c1)
    try:
        yield
    finally:
        C.lipm_x = saved


def score_ramp(su, L, T, mass, c0, c1, **kw):
    with cop_ramp(c0, c1):
        return C.score(su, L, T, mass, **kw)

"""Milestone 41: a stance that stands at zero press.

Milestone 32's leaned poses put the centre of pressure at the middle of the sole under the mid-window press
(37.5 N). Milestone 40 found that 12 of the 35 lean so far into the wall that they fall towards it below 4-12 N
of press, so a nailer whose recoil lifts the nose leaves the robot leaning on nothing. Here such a pose is
re-leaned: the balanced centre of mass is moved back (``com_dx`` smaller) to the furthest-forward lean that
still stands at zero press, which keeps as much of the original window above it as any zero-standing lean can
(both edges of the balancing window rise with the lean).

Pure helpers: the bisection on the lean and an analytic check of the window's width. Units: metres, newtons.
"""
import math

G = 9.81


def lean_for_zero(stands0, lo, hi, tol=5e-4, iters=40):
    """Largest lean ``dx`` in [lo, hi] at which ``stands0(dx)`` is true, by bisection, assuming the set where
    it holds is an interval reaching ``lo`` from above. ``stands0(lo)`` must be true and ``stands0(hi)``
    false; returns (dx, number of evaluations)."""
    if not stands0(lo):
        raise ValueError("stands0(lo) must hold")
    if stands0(hi):
        raise ValueError("stands0(hi) must fail")
    n = 2
    for _ in range(iters):
        if hi - lo <= tol:
            break
        mid = (lo + hi) / 2
        n += 1
        lo, hi = (mid, hi) if stands0(mid) else (lo, mid)
    return lo, n


def covers(window, a, b):
    """True when the balancing window (lowest, highest) contains [a, b]."""
    return window is not None and window[0] <= a and window[1] >= b


def window_width(mass, sole_len, height, tool_kg=0.0, tool_dx=0.0):
    """Width (N) of the press window of a rigid stance pushing horizontally at ``height`` above the sole:
    the press's moment F h about the sole moves the centre of pressure, which can travel ``sole_len``, so
    dF = (m + m_tool) g sole_len / h (the tool's weight adds to the normal load; its lever arm ``tool_dx``
    shifts both edges, not the width). Friction is assumed not to bind."""
    del tool_dx
    return (mass + tool_kg) * G * sole_len / height


def margin_above(window, top):
    """How far (N) the window's highest balancing press sits above ``top`` (negative when it does not reach)."""
    return -math.inf if window is None else window[1] - top

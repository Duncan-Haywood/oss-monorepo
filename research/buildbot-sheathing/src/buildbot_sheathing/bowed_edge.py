"""Milestone 6b: a bowed bottom edge as a curve, not three feet.

Milestones 3, 5 and 6 model an outward bow of the bottom edge by s as a third foot at mid-width,
s below the corners. Resting on that one point the sheet is an inverted pendulum and falls onto
a corner, tilting 2 s / W. A smooth convex edge behaves differently. If the edge has radius of
curvature R at the contact and the centre of mass sits h0 above it, rolling by theta raises the
centre of mass by about (R - h0) theta^2 / 2, so the sheet is stable about level when R > h0 and
gravity gives a restoring moment

    M(theta) = m g (R - h0) theta        (|theta| below 4 s / W, where the contact reaches a corner).

A parabolic bow z = -s (1 - (2y/W)^2) has R = W^2 / (8 s) at mid-width: 117 m at 1/16 in on a
48 in sheet, against h0 = H/2 + s = 1.22 m. Only wall friction can then hold a tilt, at most

    theta_s = mu F_n r_bar / (m g (R - h0)),

with r_bar the mean distance of the wall contacts from the mid-width contact. A kink (R -> 0)
keeps the full rock of 2 s / W. ``profile`` builds the feet for ``ledger.seat`` and
``drake_seat.seat`` (their ``edge`` argument); ``panel_tilt`` is ``ledger.panel_tilt`` with the
rock drawn from simulated seats instead of 2 s / W.
"""
import math

import numpy as np

from . import ledger as L

R_FOOT = 0.002


def profile(p=2.0, s=L.STRAIGHT, n=49, bump=None):
    """(y, dz) of n feet on the edge z = -s (1 - |2y/W|^p) (dz < 0 below the corner line).

    p = 2 is a parabola, p = 1 a tent with a kink at mid-width. ``bump`` = (y, h) adds one foot
    h below a straight edge at y (grit on the ledger, or a burr on the edge), with s ignored."""
    hw = L.W / 2 - R_FOOT
    ys = np.linspace(-hw, hw, n)
    if bump is not None:
        yb, hb = bump
        pts = [(float(y), 0.0) for y in ys]
        pts.append((float(yb), -float(hb)))
        return pts
    return [(float(y), float(-s * (1 - abs(2 * y / L.W) ** p))) for y in ys]


def radius(s=L.STRAIGHT, p=2.0):
    """Radius of curvature of the profile at mid-width (m); inf for p > 2, 0 for p < 2."""
    if p == 2:
        return L.W ** 2 / (8 * s)
    return math.inf if p > 2 else 0.0


def h0(s=L.STRAIGHT):
    return L.H / 2 + s


def r_bar_mid(layout="corners"):
    return L.r_bar(layout, corner=(0.0, -L.H / 2))


def stick_band(mu, f_n, s=L.STRAIGHT, layout="corners"):
    """Largest tilt (rad) wall friction can hold on a parabolic bow of sag s."""
    k = L.MASS * L.G * (radius(s) - h0(s))
    return min(mu * f_n * r_bar_mid(layout) / k, 4 * s / L.W)


def three_foot_rock(s=L.STRAIGHT):
    return 2 * s / L.W


def panel_tilt(rng, n, rock_draw, square_frac=1.0, straight_frac=1.0):
    """``ledger.panel_tilt`` with the outward-bow rock drawn from ``rock_draw``: simulated seated
    tilts (rad) at the full 1/16 in bow, scaled by s / (1/16 in) (the stick band is linear in s
    while R >> h0). Inward bows rest on both corners, as before."""
    a = rng.uniform(-1, 1, n) * square_frac * L.corner_angle_limit()
    s = rng.uniform(-1, 1, n) * straight_frac * L.STRAIGHT
    rock = np.where(s > 0, s / L.STRAIGHT, 0.0) * rng.choice(np.asarray(rock_draw, float), n)
    return a + rock

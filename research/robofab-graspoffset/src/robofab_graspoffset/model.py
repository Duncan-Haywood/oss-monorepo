"""Parallel-jaw grasp of a cube whose centre of mass is off the pad centre (stylised).

A cube of side L is pinched on two opposite faces (normal x). Its centre of mass is offset by d along
y, in the pad plane, so gravity gives a force m*g (down, z) and a torque m*g*d about the grasp axis x.
Each pad carries half of both. Two idealised pad types, both with Coulomb friction mu:

* ``ball``: one point contact per pad. Torque is resisted only by torsional friction, a moment of at
  most mu_t*N per contact (mu_t in metres). With MuJoCo's elliptic friction cone the requirement is
  ``(f/(mu*N))^2 + (tau/(mu_t*N))^2 <= 1`` per contact, i.e.
  ``N >= (m*g/2) * sqrt(1/mu^2 + (d/mu_t)^2)``.
* ``flat``: a rigid flat pad on a flat face. The rigid-body contact model replaces the patch by its four
  corner points (what MuJoCo's box-box contact generates), each carrying N/4 and a friction force of
  at most mu*N/4 in the face plane. Force and torque are then bounded by the support function of the
  Minkowski sum of four friction discs (see ``flat_required_force``). No torsional friction is used.
  The split of the normal load between the corners is not determined; the model gives an interval.

Density, friction and mu_t are assumed values.
"""
import itertools
import math

import numpy as np

G = 9.81
DENSITY = 1240.0  # kg/m^3, PLA-like (assumed)


def mass_kg(side_mm, density=DENSITY):
    return density * (side_mm * 1e-3) ** 3


def ball_required_force(side_mm, d_mm, mu, mu_t):
    """Per-jaw force (N) for the ball pad under the elliptic cone (see module docstring)."""
    return mass_kg(side_mm) * G / 2 * math.sqrt(1 / mu ** 2 + (d_mm * 1e-3 / mu_t) ** 2)


def _flat_req(side_mm, d_mm, mu, w, n_angles=1440):
    h = side_mm * 1e-3 / 2
    m = mass_kg(side_mm)
    tf, tt = m * G / 2, m * G * d_mm * 1e-3 / 2
    a = np.linspace(0, 2 * np.pi, n_angles, endpoint=False)
    nf, nt = np.cos(a), np.sin(a)
    corners = [(sy * h, sz * h) for sy in (-1, 1) for sz in (-1, 1)]
    sup = mu * sum(wi * np.hypot(-nt * z, nf + nt * y) for wi, (y, z) in zip(w, corners))
    return float(np.max((nf * tf + nt * tt) / np.maximum(sup, 1e-12)))


def flat_required_force(side_mm, d_mm, mu, split="equal", steps=10):
    """Per-jaw force (N) for the flat pad, four corner contacts at (+-h, +-h), h = L/2.

    Wrench of a corner at (y, z) with friction (fy, fz): (Fz, tau) = (fz, y*fz - z*fy). Corner i carries
    normal share w_i*N and friction up to mu*w_i*N. The feasible wrench set is convex, with support
    function h(n) = mu*N*sum_i w_i*|(-n_tau*z_i, n_F + n_tau*y_i)|. The target wrench (m*g/2, m*g*d/2)
    is feasible iff n.w <= h(n) for all unit n, so N_min = max_n (n.w)/(mu*sum_i w_i|...|).
    ``split="equal"``: w_i = 1/4 (an upper bound on the force a rigid flat pad needs: one possible
    normal-load split). ``split="best"``: the minimum over splits on a grid of step 1/``steps`` (a lower
    bound for four corner contacts: a rigid flat pad's pressure distribution is statically
    indeterminate, so the solver may choose any split).
    """
    if split == "equal":
        return _flat_req(side_mm, d_mm, mu, [0.25] * 4)
    best = float("inf")
    for w in itertools.product(range(steps + 1), repeat=4):
        if sum(w) == steps:
            best = min(best, _flat_req(side_mm, d_mm, mu, [x / steps for x in w]))
    return best

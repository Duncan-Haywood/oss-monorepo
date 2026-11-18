"""Milestone 35: the nailer's air hose as a force on the tool.

Milestones 33-34 counted the hose, if at all, as mass. A hose hangs from the tool's air fitting down to
the floor, lies there, and runs back to the compressor. At the fitting it pulls with

* the **weight of the hanging length**, and
* a **horizontal tension** ``H`` that the floor holds: zero if the hose lies loose, up to the friction
  of the length lying on the floor, ``mu_f w g L_drag``, once the robot has walked along the wall and
  dragged it taut. ``H`` changes as the robot moves, so neither a feedforward nor a compensator knows it.

The hanging part is a catenary with a horizontal tangent at the touchdown point (the floor carries the
rest). With ``a = H / (w g)`` and the fitting a height ``h`` above the floor, the curve
``y = a (cosh(x / a) - 1)`` reaches ``h`` after an arc length ``s`` with ``s^2 = h^2 + 2 a h``. The
vertical tension at the fitting is the weight of that arc, ``w g s``; the horizontal tension is ``H``
everywhere. For ``H = 0`` the hose hangs straight down and ``s = h``. Bending stiffness is neglected.

Units: metres, kilograms, newtons; ``phi`` (rad) is the direction the hose pulls in the floor plane,
in the robot frame (0 = +x, towards the wall; pi/2 = +y, along the wall).
"""
import math

import numpy as np

G = 9.81
LB = 0.45359237
FT = 0.3048

# 3/8 in x 50 ft air hoses, listed weights (fittings included); see the README's parameter table
HOSES = {
    "hybrid": 5.1 * LB / (50 * FT),     # Flexzilla HFZ3850YW2, 5.1 lb (Flexair 5.08 lb)
    "rubber": 9.21 * LB / (50 * FT),    # Workforce 3/8 x 50 ft rubber, 9.21 lb (Tekton 7.30 lb)
}


def hanging_length(h, H, w):
    """Arc length (m) of a hose hanging from height ``h`` to a flat touchdown, horizontal tension ``H``
    (N), weight per length ``w`` (kg/m)."""
    if h <= 0:
        return 0.0
    return math.sqrt(h * h + 2.0 * h * H / (w * G))


def touchdown(h, H, w):
    """Horizontal distance (m) from the fitting to the touchdown point (0 for a straight hang)."""
    if H <= 0 or h <= 0:
        return 0.0
    a = H / (w * G)
    return a * math.acosh(1.0 + h / a)


def max_drag(w, mu_f, length):
    """The largest horizontal tension (N) the floor holds before a dragged length starts to slide."""
    return mu_f * w * G * length


def force(h, H, w, phi):
    """The hose's force on the tool at the fitting (N, robot frame x, y, z)."""
    s = hanging_length(h, H, w)
    return np.array([H * math.cos(phi), H * math.sin(phi), -w * G * s])


def generalised(jp, f):
    """Generalised force (nv) of a point force ``f`` applied where the translation Jacobian is ``jp``."""
    return np.asarray(jp).T @ np.asarray(f, float)

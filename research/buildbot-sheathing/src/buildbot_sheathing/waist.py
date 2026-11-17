"""Milestone 39: a per-joint backlash gap for the waist cases (stock, yaw only, precision, braked).

Torques do not depend on the gap (milestone 30's model), so a case changes only what a flipped or loose waist
joint costs: ``wrist_ft.joint_error`` and ``backlash.joint_sigmas`` take the per-joint gap this returns.
"""
import numpy as np

CASES = ("stock", "yaw only", "precision", "braked")


def case_gaps(names, waist, gap, case, precision=None):
    """Per-joint total gap (rad).

    ``names`` the actuated joint names, ``waist`` the indices of the waist (or torso) joints, ``gap`` every
    joint's stock gap, ``precision`` the waist gap of a precision gearbox. 'stock' keeps ``gap`` everywhere;
    'yaw only' makes every waist joint but the yaw rigid (as on the one-waist-joint G1); 'precision' sets the
    waist to ``precision``; 'braked' sets it to 0 (a holding brake or a lock at the posed angle)."""
    if case not in CASES:
        raise ValueError(f"unknown waist case {case!r}")
    g = np.full(len(names), float(gap))
    for j in waist:
        if case == "precision":
            if precision is None:
                raise ValueError("'precision' needs a precision gap")
            g[j] = precision
        elif case == "braked" or (case == "yaw only" and "yaw" not in names[j]):
            g[j] = 0.0
    return g

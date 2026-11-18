"""Milestone 33: model-based compensation of the held joints' backlash, and the model error it survives.

Milestones 31-32 showed one tool-point calibration cannot remove the held joints' backlash bias along a
wall: the bias ``delta(p)`` (half the gap against the sign of each held joint's static torque,
``pose_range.held_bias``) changes with the pose. The remedy they named is to *predict* each held joint's
side at every pose from a torque model and subtract the predicted bias ``delta_hat(p)`` in joint space.
After that and one tool-frame calibration at a reference pose, what is left at pose p is

    mu(p) = A(p) [delta(p) - delta_hat(p)] - A(ref) [delta(ref) - delta_hat(ref)]

(and the same with the depth-point rows B). With a perfect model ``delta_hat = delta`` and mu = 0. The
compensator's model can be wrong about the ground-reaction split the balance controller picks, or about
the tool's mass; a joint is then

* **wrong side**: predicted and truly held, on opposite sides (an error of the full gap);
* **spurious**: predicted held but truly loose (half a gap subtracted that is not there);
* **missed**: truly held but not compensated (half a gap left), e.g. inside a guard band.

A guard band ``tau_g`` compensates only joints whose predicted |tau| is at least ``tau_g`` at both press
ends, trading wrong sides for missed joints. Units: metres, radians, newton metres.
"""
import numpy as np

from .backlash import held
from .pose_range import held_bias, nose_bias


def predicted_bias(tau_lo, tau_hi, tau_f, gap, tau_g=0.0):
    """delta_hat (rad): the compensator's held-joint bias, compensating only joints held at
    max(tau_f, tau_g)."""
    return held_bias(tau_lo, tau_hi, max(tau_f, tau_g), gap)


def classify(delta, delta_hat, moving):
    """Counts of mispredicted joints among those that move the nose: (wrong side, spurious, missed)."""
    d, h, m = np.asarray(delta), np.asarray(delta_hat), np.asarray(moving, bool)
    wrong = m & (d != 0) & (h != 0) & (np.sign(d) != np.sign(h))
    spur = m & (d == 0) & (h != 0)
    miss = m & (d != 0) & (h == 0)
    return int(wrong.sum()), int(spur.sum()), int(miss.sum())


def compensated(rows_p, rows_ref, err_p, err_ref, L):
    """mu(p) after model-based compensation and one calibration at the reference pose. ``rows_*`` are
    (jp, jr) and ``err_*`` the joint-space errors delta - delta_hat at each pose; returns the dict
    ``pose_range.residual`` does: y and z, each (surface, depth)."""
    bp = nose_bias(rows_p[0], rows_p[1], err_p, L)
    br = nose_bias(rows_ref[0], rows_ref[1], err_ref, L)
    return {k: (bp[k][0] - br[k][0], bp[k][1] - br[k][1]) for k in ("y", "z")}

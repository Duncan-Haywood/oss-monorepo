"""Milestone 31: gear backlash across the poses a robot takes along a wall.

Milestone 30 (``backlash``) split each joint's backlash into a random part (a *loose* joint, one the
static load does not hold to one side of its gap) and a fixed bias (a *held* joint), and assumed a
tool-point calibration removes the bias. That holds at the pose the calibration was taken at. At
another pose two things change:

* the held joint's torque can change sign, so it rests on the other side of its gap;
* even with the same sign, the same joint-space bias reaches the nose through a different Jacobian.

A held joint rests on the side its *external* load pushes it to: half the gap against the sign of
the actuator torque the static balance needs (``backlash.static_torques`` returns that torque). The
bias at the nose (surface) and at the depth point is ``A delta`` and ``B delta`` with milestone 30's
rows. A full tool-frame calibration at a reference pose measures both and subtracts them everywhere;
what is left at pose p is

    mu(p) = A(p) delta(p) - A(ref) delta(ref)
          = [A(p) - A(ref)] delta(ref)      (the Jacobian part)
          + A(p) [delta(p) - delta(ref)]    (the sign-flip and held-set part)

and the same with B for the depth point. ``with_bias`` puts it into a ``ToolError`` as a fixed offset
of every nail. Units: metres, radians, newtons.
"""
import numpy as np

from .backlash import held, tool_rows
from .tool_lean import DEPTH_CHECK, AxisError, ToolError


def held_bias(tau_lo, tau_hi, tau_f, gap):
    """Per-joint fixed error (rad): -sign(tau) gap / 2 on joints held over the press range, else 0."""
    h = held(tau_lo, tau_hi, tau_f)
    return np.where(h, -np.sign(np.asarray(tau_hi, float)) * gap / 2.0, 0.0)


def nose_bias(jp, jr, delta, L, r=(0.0, 0.0), depth=DEPTH_CHECK):
    """Fixed offsets (m) of the nose and the depth point from a joint-space bias ``delta``:
    a dict with y and z, each (surface, depth)."""
    t = np.array([L, r[0], r[1]])
    A = tool_rows(jp, jr, t) @ delta
    B = tool_rows(jp, jr, t + np.array([depth, 0.0, 0.0])) @ delta
    return {"y": (float(A[1]), float(B[1])), "z": (float(A[2]), float(B[2]))}


def residual(b_pose, b_ref):
    """What a full tool-frame calibration at the reference pose leaves at another pose."""
    return {k: (b_pose[k][0] - b_ref[k][0], b_pose[k][1] - b_ref[k][1]) for k in ("y", "z")}


def with_bias(err, mu):
    """A copy of ``err`` (``ToolError``) with the fixed offsets ``mu`` (from ``residual``)."""
    def ax(e, m):
        return AxisError(e.s_surf, e.s_depth, e.rho, e.mu_s + m[0], e.mu_d + m[1])
    return ToolError(ax(err.y, mu["y"]), ax(err.z, mu["z"]), err.s_lean, err.depth)


def sign_flips(taus, held_masks, moving):
    """Indices of joints that move the nose, are held at every pose, and whose torque sign differs
    between poses. ``taus`` and ``held_masks`` are lists over poses."""
    T = np.array(taus)
    H = np.array(held_masks)
    always = H.all(axis=0) & np.asarray(moving, bool)
    s = np.sign(T)
    flip = (s.max(axis=0) > 0) & (s.min(axis=0) < 0)
    return np.flatnonzero(always & flip)

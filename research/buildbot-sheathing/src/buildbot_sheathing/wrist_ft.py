"""Milestone 36: a wrist force-torque sensor as the remedy for the air hose (milestone 35).

Milestone 35 found the hose an unknown, pose- and history-dependent force at the grip: milestone 33's matched
backlash compensator, which predicts each held joint's side from a no-hose torque model, was left about 1 mm
along the wall by a 5 N drag. A wrist F/T sensor measures the wrench the tool puts on the wrist, so the
compensator can predict from the *measured* load instead. What is left:

* the sensor's error ``e`` (N): the predicted torques are the controller's QP under ``f + e`` while the robot's
  are under ``f``, so a held joint near its friction threshold can be predicted on the wrong side and the
  predicted windup is off by ``-K^-1 J^T e``;
* the joints' stiffness: the predicted windup uses ``k_t (1 + eps)``, so a fraction
  ``1 - 1 / (1 + eps)`` of the true windup is left (``kt_share``).

The joint-space error at a pose is ``joint_error``; milestone 33's ``compensate.compensated`` turns it into the
residual at the nose after one calibration. Sensor figures (one sigma per axis, N):

* Robotiq FT 300, current version: signal noise 0.1 N on Fx, Fy, Fz (standard deviation over 1 s) and
  0.005 N m on Mx, My (Robotiq FT Sensor instruction manual, specifications);
* the same sensor sold before 10/2017: 1.2 N on Fx, Fy and 0.5 N on Fz (same table);
* ATI Mini45, SI-145-5 calibration: resolution 1/16 N on Fx, Fy, Fz after dropping four counts of noise
  (ati-ia.com, Mini45 product page). Used as a noise proxy; ATI publishes no accuracy figure for it.

Neither publishes a bias drift between tares, so the bias is swept. Moment errors are not modelled (the hose
acts at the grip, where the sensor's force reading carries it). Units: newtons, radians, newton metres.
"""
import math

import numpy as np

from .pose_range import held_bias
from .windup import free_windup

SENSORS = {
    "ft300": (0.1, 0.1, 0.1),
    "ft300_pre2017": (1.2, 1.2, 0.5),
    "mini45": (1 / 16, 1 / 16, 1 / 16),
}

AXES = tuple(np.array(v, float) for v in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)))


def mean_change(t, t0):
    """Mean torque change over the press window: t and t0 are (tau at the low end, tau at the high end)."""
    return 0.5 * ((np.asarray(t[0]) + np.asarray(t[1])) - (np.asarray(t0[0]) + np.asarray(t0[1])))


def joint_error(t, t_hat, t0, tau_f, gap, k, eps=0.0):
    """Actual minus predicted joint error (rad): backlash sides and transmission windup.

    ``t`` the robot's torques under the true load, ``t_hat`` the compensator's (under the measured load, or the
    no-hose model ``t0`` when there is no sensor), ``t0`` the no-hose torques the windup is counted from;
    the compensator models the windup at stiffness ``k (1 + eps)``. With no sensor pass ``t_hat = t0`` and
    ``eps = math.inf`` (the windup is not predicted at all)."""
    err = held_bias(t[0], t[1], tau_f, gap) - held_bias(t_hat[0], t_hat[1], tau_f, gap)
    err = err + free_windup(mean_change(t, t0), k)
    if math.isfinite(eps):
        err = err - free_windup(mean_change(t_hat, t0), k * (1.0 + eps))
    return err


def kt_share(eps):
    """The fraction of the true windup a model at k_t (1 + eps) leaves: 1 - 1 / (1 + eps)."""
    return 1.0 - 1.0 / (1.0 + eps)


def two_sigma(sensor):
    """The largest per-axis 2 sigma error of a listed sensor (N)."""
    return 2.0 * max(SENSORS[sensor])


def combine_spans(*parts):
    """Combine spans (``windup.offsets``-shaped dicts of uniform-equivalent widths) by adding variances."""
    return {ax: tuple(math.sqrt(sum(p[ax][j] ** 2 for p in parts)) for j in (0, 1)) for ax in ("y", "z")}


def uniform_equivalent(offset):
    """The uniform span with the variance of a Gaussian whose sigma is ``offset``: sqrt(12) sigma."""
    r = math.sqrt(12.0)
    return {ax: (r * offset[ax][0], r * offset[ax][1]) for ax in ("y", "z")}

"""Joint torque limits scaled by group, to ask which joint's limit sets a stock humanoid's carry speed.

`buildbot_carryphase` scores a prescribed single-support carry step against the Menagerie model's per-joint torque
limits. Here those limits are multiplied by a factor for one group of joints (waist or torso, arms, legs, ankles, or
all), and the same step is re-scored. A factor is a what-if for a stronger actuator, not a claim that one exists.
Everything else (IK, inverse dynamics, centre-of-pressure and friction tests) is `buildbot_carryphase`'s, unchanged.
"""
from contextlib import contextmanager

import numpy as np
import mujoco

from buildbot_carryphase import model as C
from buildbot_payload import model as P

_BASE = P.torque_limits   # the unscaled limits, kept so the patch below never calls itself
GROUPS = ("waist", "arms", "legs", "ankles", "all")
_ARM = ("shoulder", "elbow", "wrist")
_LEG = ("hip", "knee", "ankle")


def joint_group(name):
    """Group of a Menagerie G1 / H1 joint name: waist, arms, ankles or legs (hips, knees)."""
    if name.startswith(("waist", "torso")):
        return "waist"
    if any(k in name for k in _ARM):
        return "arms"
    if "ankle" in name:
        return "ankles"
    if any(k in name for k in _LEG):
        return "legs"
    return "other"


def scaled_limits(model, group, factor):
    """P.torque_limits(model) with the joints of `group` multiplied by `factor` ('all' scales every joint)."""
    lim = _BASE(model).copy()
    for j in range(model.njnt):
        d = model.jnt_dofadr[j]
        if not np.isfinite(lim[d]):
            continue
        name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_JOINT, j)
        g = joint_group(name)
        if group == "all" or g == group:
            lim[d] *= factor
    return lim


@contextmanager
def limits(group, factor):
    saved = P.torque_limits
    P.torque_limits = lambda m: scaled_limits(m, group, factor)
    try:
        yield
    finally:
        P.torque_limits = saved


def score(su, L, T, mass, group, factor, **kw):
    with limits(group, factor):
        return C.score(su, L, T, mass, **kw)

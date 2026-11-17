"""Milestone 38: a two-hand squeeze as the arm-joint preload (milestone 37 left the arms and waist).

The robot holds the tool in both hands. A force pair ``+s u`` on the left grip point and ``-s u`` on the
right, with ``u`` the unit vector from the right grip point to the left, has zero net force and, because
both forces lie on the line through the two points, zero net moment. So it changes neither the tool's
wrench nor the base's balance: the ground reaction, the leg torques and the waist torques stay as they
were, and only the joints between the waist and each hand see it (``generalised``). It is the arms'
counterpart of milestone 37's leg preload.

The controller picks ``s`` once for the press from its plan (``best_squeeze``): the value on a grid over
``[-S, S]`` that maximises the smallest distance ``||tau_j| - tau_f|`` over the chosen arm joints at
both press ends, with every arm joint inside its actuator's torque limit.
Units: newtons, newton metres.
"""
import numpy as np


def direction(p_left, p_right):
    """Unit vector from the right grip point to the left one."""
    v = np.asarray(p_left, float) - np.asarray(p_right, float)
    return v / np.linalg.norm(v)


def generalised(jp_left, jp_right, u):
    """Generalised force (nv) of one newton of squeeze: ``+u`` on the left hand, ``-u`` on the right.
    It enters the load the way the tool's weight does (``grf_qp.generalised_load``): h loses it."""
    u = np.asarray(u, float)
    return np.asarray(jp_left).T @ u - np.asarray(jp_right).T @ u


def best_squeeze(tau_lo, tau_hi, a, idx, tau_f, S, lim, step=0.05):
    """(s, margin): the squeeze on the grid ``-S..S`` (``step`` apart) that maximises the smallest
    ``||tau_j(s)| - tau_f|`` over joints ``idx`` at both press ends, where ``tau(s) = tau + a s`` (``a``:
    actuated torque per newton of squeeze), with ``|tau_j(s)| <= lim_j`` on every joint in ``idx``.
    Ties go to the smallest |s|. With S = 0 it returns (0, the margin at s = 0)."""
    idx = np.asarray(idx, int)
    n = int(round(S / step)) if S > 0 else 0
    s = np.linspace(-n * step, n * step, 2 * n + 1)
    a, lim = np.asarray(a, float)[idx], np.asarray(lim, float)[idx]
    best = None
    for t in (np.asarray(tau_lo, float), np.asarray(tau_hi, float)):
        T = t[idx][None, :] + s[:, None] * a[None, :]          # grid x joints
        mg = np.min(np.abs(np.abs(T) - tau_f), axis=1)
        ok = np.all(np.abs(T) <= lim[None, :], axis=1)
        mg = np.where(ok, mg, -np.inf)
        best = mg if best is None else np.minimum(best, mg)
    order = np.lexsort((np.abs(s), -best))                     # largest margin, then smallest |s|
    k = order[0]
    return float(s[k]), float(best[k])


def torque_limits(robot, names):
    """Each actuated joint's torque limit (N m) from the MJCF: the joint's actuatorfrcrange when set
    (the G1), else its motor's ctrlrange times the gear (the H1's torque motors); inf if neither."""
    import mujoco
    m = robot.model
    out = []
    for nm in names:
        j = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, nm)
        lo, hi = m.jnt_actfrcrange[j]
        if m.jnt_actfrclimited[j] and hi > lo:
            out.append(float(max(abs(lo), abs(hi))))
            continue
        lim = np.inf
        for i in range(m.nu):
            if m.actuator_trnid[i, 0] == j and m.actuator_ctrllimited[i]:
                lim = float(max(abs(m.actuator_ctrlrange[i]).max() * abs(m.actuator_gear[i, 0]), 0.0))
        out.append(lim)
    return np.asarray(out)

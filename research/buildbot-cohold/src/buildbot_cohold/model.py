"""A person leads, a robot follows: planar sheet dynamics, robot joint torques, ISO/TS 15066 speeds.

The sheet is a rigid rod of length L and mass m. Its person end is pinned to a prescribed hand path P(t)
(the person's lead). Its robot end is pushed by the robot's hand force, an impedance law around a reference
that copies the person's motion after a lag. The rod's one degree of freedom is its angle about P.
The pin's reaction is what the person carries. The robot hand's position and force then go through the
static whole-body torque check of buildbot-payload (extended to a horizontal hand force).
"""
import math

import mujoco
import numpy as np

G = 9.81

# ISO/TS 15066:2016 Table A.2/A.3 body-model parameters as printed in Table 1 of arXiv:2311.13814
# (the standard itself is paywalled and was not read): region -> (max permissible force N, spring constant N/mm, effective mass kg)
BODY = {
    "skull and forehead": (130, 150, 4.4), "face": (65, 75, 4.4), "neck": (150, 50, 1.2),
    "back and shoulders": (210, 35, 40), "chest": (140, 25, 40), "abdomen": (110, 10, 40), "pelvis": (180, 25, 40),
    "upper arms and elbow joints": (150, 30, 3), "lower arms and wrist joints": (160, 40, 2),
    "hands and fingers": (140, 75, 0.6), "thighs and knees": (220, 50, 75), "lower legs": (130, 60, 75),
}


def v_safe(region, m_robot):
    """Maximum relative speed (m/s) from the energy balance of arXiv:2311.13814 eq. 1-2: F / sqrt(mu k)."""
    f, k, mh = BODY[region]
    mu = 1.0 / (1.0 / mh + 1.0 / m_robot)
    return f / math.sqrt(mu * k * 1000.0)


def min_jerk(s):
    s = min(max(s, 0.0), 1.0)
    return 10 * s**3 - 15 * s**4 + 6 * s**5


def simulate(m, L=2.44, lift=0.3, T=2.0, K=1000.0, B=150.0, lag=0.2, dt=1e-3, t_end=None, ff=0.5):
    """Integrate the rod. Returns arrays t, R (x,z), Rdot, F_R (x,z) on the sheet, F_P (x,z) on the sheet, theta.

    World frame: x toward the robot's side, z up. P starts at the origin, R at (L, 0), rod horizontal.
    The robot feeds forward half the sheet's weight and holds nothing else.
    """
    t_end = t_end if t_end is not None else T + lag + 2.0
    n = int(t_end / dt)
    I = m * L * L / 3.0
    zP = lambda t: lift * min_jerk(t / T)
    th, w = 0.0, 0.0
    rows = []

    def accP(t):
        h = 1e-3
        return (zP(t + h) - 2 * zP(t) + zP(t - h)) / h**2

    def force(t, th, w):
        Rx, Rz = L * math.cos(th), zP(t) + L * math.sin(th)
        vz = (zP(t + 1e-4) - zP(t - 1e-4)) / 2e-4
        Rvx, Rvz = -L * math.sin(th) * w, vz + L * math.cos(th) * w
        refz = zP(t - lag)  # the robot's hand wants to be where the person's end was `lag` ago
        Fx = K * (L - Rx) - B * Rvx
        Fz = ff * m * G + K * (refz - (Rz - 0.0)) * 1.0 - B * Rvz
        return Rx, Rz, Rvx, Rvz, Fx, Fz

    for i in range(n):
        t = i * dt
        Rx, Rz, Rvx, Rvz, Fx, Fz = force(t, th, w)
        a = accP(t)
        # angular acceleration about P (x-axis acceleration of P is zero)
        alpha = (-m * (G + a) * (L / 2) * math.cos(th) + L * (math.cos(th) * Fz - math.sin(th) * Fx)) / I
        acm_x = -(L / 2) * (math.sin(th) * alpha + math.cos(th) * w * w)
        acm_z = a + (L / 2) * (math.cos(th) * alpha - math.sin(th) * w * w)
        FPx = m * acm_x - Fx
        FPz = m * acm_z + m * G - Fz
        rows.append((t, Rx, Rz, Rvx, Rvz, Fx, Fz, FPx, FPz, th))
        w += alpha * dt
        th += w * dt
    A = np.array(rows)
    return {"t": A[:, 0], "R": A[:, 1:3], "Rdot": A[:, 3:5], "FR": A[:, 5:7], "FP": A[:, 7:9], "theta": A[:, 9]}


def wrench_torques(P, robot, qpos, load_fwd, load_down, grip="palm"):
    """Static joint torques with a hand load of (forward, down) newtons in total, half on each hand.

    Same as buildbot_payload.model.torques, but the load may have a horizontal part.
    Returns (max |tau|/limit, joint name of that max, min foot normal force).
    """
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    bias = d.qfrc_bias.copy()
    load = np.zeros(m.nv)
    for b, p in robot.hands[grip]:
        jp, _ = P._jac(m, d, P._bid(m, b), p)
        load += jp.T @ np.array([load_fwd / 2, 0.0, -load_down / 2])
    Jc = np.vstack([np.vstack(P._jac(m, d, P._bid(m, b), p)) for b, p in robot.feet])
    f, *_ = np.linalg.lstsq(Jc[:, :6].T, bias[:6] - load[:6], rcond=None)
    tau = bias - load - Jc.T @ f
    tau[:6] = 0.0
    lim = P.torque_limits(m)
    ratio = np.where(np.isfinite(lim), np.abs(tau) / lim, 0.0)
    k = int(np.argmax(ratio))
    jid = int(np.flatnonzero(m.jnt_dofadr == k)[0])
    return float(ratio.max()), mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, jid), float(min(f[2], f[8]))


def reflected_mass(P, robot, qpos, direction, grip="palm"):
    """Effective mass (kg) at one hand along `direction` (robot frame) with the legs and base locked."""
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    b, p = robot.hands[grip][0]
    jp, _ = P._jac(m, d, P._bid(m, b), p)
    idx = [i for i in range(6, m.nv) if np.abs(jp[:, i]).sum() > 1e-9]
    Mf = np.zeros((m.nv, m.nv))
    try:
        mujoco.mj_fullM(m, d, Mf)          # MuJoCo >= 3.3
    except TypeError:
        mujoco.mj_fullM(m, Mf, d.qM)
    u = np.asarray(direction, float)
    u = u / np.linalg.norm(u)
    Jd = u @ jp[:, idx]
    inv = float(Jd @ np.linalg.solve(Mf[np.ix_(idx, idx)], Jd))
    return 1.0 / inv

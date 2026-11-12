"""codesign-cant milestone 6: position hold with the corrected side force, the shared thrust polytope and longer episodes with a wind step.

A canted rotor tilts its thrust about its own arm. When the mixer moves thrust between rotors to make roll or pitch torque, the
tangential components no longer cancel and the body feels a horizontal force. From the rows of `allocation.layout` (checked in
tests/test_poshold.py), a delivered body torque (tau_x, tau_y, tau_z) brings the body-frame force

    F_y = lat * tau_x,   F_x = lat * tau_y,   lat = sin(alpha) / (L cos(alpha) - kappa sin(alpha)),

and yaw torque brings none (the tangents of the four rotors sum to zero). `codesign-aero-cant-poshold` used tan(alpha) / (L / sqrt 2),
sqrt 2 too large, a per-axis torque box, and 2 s episodes. Here: the attitude-priority mixer on one thrust polytope (milestone 2),
torque limits from the allocation with the collective held at hover, 6 s episodes in which the mean wind steps at 3 s (the drift
test the earlier project deferred), and hover power priced as in milestones 2 and 4.

The vehicle model (sizing closure, attitude dynamics, gust, plant randomisation) is `aero`'s. The translation model is
`codesign-aero-cant-poshold`'s: perfect altitude hold (the vertical thrust balances weight through the tilt), drag 0.5 rho Cd A v|v|
from the same gust that drives the disturbance torque, and the side force from the *delivered* (mixed, lagged, saturated) torque.
Constants marked ASSUMED are inherited from that project; none is from a datasheet.
"""
import numpy as np

from . import aero as A
from .allocation import mix_priority

T_END = 6.0
STEPS = int(T_END / A.DT)
T_WIND_STEP = 3.0                       # s: the mean wind steps here (drift test)
WIND_STEP = 3.0                         # m/s per horizontal axis, random sign per episode and axis (ASSUMED; 3 -> 0 or 6 m/s)
YAW_REF_DEG = 30.0                      # yaw steps +-30 deg, four segments of 1.5 s (as the earlier project, stretched to 6 s)
POS_LO, POS_HI = np.array([-1.0, -1.0, -2.0]), np.array([1.0, 1.0, 0.5])   # log10 outer-loop kp (1/s^2), kd (1/s), ki (1/s^3); ASSUMED (inherited)
POS_NOISE, VEL_NOISE = 0.02, 0.05       # m, m/s: GNSS-class noise (ASSUMED, inherited)
OFFSET = 0.5                            # initial horizontal offset, uniform +-m per axis (ASSUMED, inherited)
TILT_CMD_MAX = np.deg2rad(20.0)
CD_A = 1.0                              # drag coefficient on the area in aero.size (ASSUMED, inherited)
POS_SCALE_M, YAW_SCALE_DEG = 0.10, 10.0  # composite C = sqrt((pos / 0.10 m)^2 + (yaw / 10 deg)^2), one unit = 10 deg of yaw error
DEAD_POS = 5.0


def cop_signs(h):
    """Per-axis gust-torque signs (roll, pitch) for `rollout(dist_sign=...)` of a rigid body whose centre of pressure sits a height h
    above (h > 0) or below (h < 0) the centre of mass, z up. The drag F = (Fx, Fy, 0) acting at r = (0, 0, h) gives tau = r x F =
    (-h Fy, h Fx, 0); in `rollout` the roll torque goes with Fy and the pitch torque with Fx, each as +kg v|v| times its sign, so
    a rigid body has signs (-sign h, +sign h). The inherited model's (+1, +1) and its flip (-1, -1) are not rigid bodies: each puts
    the centre of pressure below the centre of mass on one axis and above it on the other (tests/test_poshold.py)."""
    s = float(np.sign(h))
    return np.array([-s, s])


def lateral_per_torque(alpha, L, kappa):
    """Body horizontal force per unit roll (or pitch) torque for the canted X layout of `allocation` (closed form of its rows)."""
    return np.sin(alpha) / (L * np.cos(alpha) - kappa * np.sin(alpha))


def reference(episodes, seed):
    """Yaw step sequence, gust and sensor noise, initial offsets and wind-step signs; independent of the design."""
    rng = np.random.default_rng(seed + 777)
    yaw = np.repeat(rng.choice([-1.0, 1.0], size=(episodes, 4)), STEPS // 4, axis=1) * np.deg2rad(YAW_REF_DEG)
    gust_n = rng.standard_normal((episodes, 2, STEPS))
    gyro_n = rng.standard_normal((episodes, 3, STEPS)) * 0.05
    ang_n = rng.standard_normal((episodes, 3, STEPS)) * 0.005
    u0 = rng.uniform(-1, 1, size=(episodes, 2))
    off = rng.uniform(-OFFSET, OFFSET, size=(episodes, 2))
    pn = rng.standard_normal((episodes, 2, STEPS)) * POS_NOISE
    vn = rng.standard_normal((episodes, 2, STEPS)) * VEL_NOISE
    wsign = rng.choice([-1.0, 1.0], size=(episodes, 2))
    return yaw, gust_n, gyro_n, ang_n, u0, off, pn, vn, wsign


def rollout(sz, gains, kappa, episodes=8, seed=0, gust_std=4.0, gust_mean=3.0, plant="wide", couple=True, wind_step=WIND_STEP, sat=None, dist_sign=1.0, lever_scale=1.0):
    """gains (N,9) physical: attitude PID roll/pitch kp, kd, ki; yaw kp, kd, ki; position kp, kd, ki.
    Hold the origin from a random offset while yaw steps +-30 deg and the mean wind steps at 3 s. Roll and pitch references come from
    the position loop; every torque request passes the attitude-priority mixer with the collective held at hover.
    couple=False switches the side force off (an ablation; the real vehicle cannot do this).
    dist_sign=-1 flips the gust's disturbance torque relative to its drag force (centre of pressure on the other side of the
    centre of mass); the inherited model fixes it at +1, which makes the steady counter-torque's side force oppose the drag.
    dist_sign may also be a pair (roll, pitch); `cop_signs` gives the pair for a rigid centre-of-pressure offset. lever_scale
    multiplies the inherited centre-of-pressure lever (0.05 + 0.3 L, ASSUMED) and so the gust torque.
    Returns per design: RMS position error (m) over the episode, over the last 3 s (after the wind step), RMS yaw error (deg),
    RMS roll/pitch tracking error (deg), and the share of episodes that diverged."""
    yaw_ref, gust_n, gyro_n, ang_n, u0, off, pn, vn, wsign = reference(episodes, seed)
    N, E = gains.shape[0], episodes
    kp = np.stack([gains[:, 0], gains[:, 0], gains[:, 3]], 1)[:, None, :]
    kd = np.stack([gains[:, 1], gains[:, 1], gains[:, 4]], 1)[:, None, :]
    ki = np.stack([gains[:, 2], gains[:, 2], gains[:, 5]], 1)[:, None, :]
    kpp, kdp, kip = (gains[:, 6, None, None], gains[:, 7, None, None], gains[:, 8, None, None])
    pl = A.plant_draw(plant, episodes, seed)
    I0 = sz["inertia"]
    I = np.stack([I0, I0, I0 * A.IZ_RATIO], 1)[:, None, :] * pl["mass"][None, :, None]
    tmax_nom = np.stack([sz["tau_max"], sz["tau_max"], sz["tau_yaw"]], 1)
    tmax = tmax_nom[:, None, :] * pl["tau"][None, :, None]
    lag = (sz["lag"][:, None] * pl["lag"][None, :])[:, :, None]
    kg = (0.5 * A.RHO * sz["area"] * sz["lever"] * lever_scale)[:, None, None]
    dsg = np.broadcast_to(np.asarray(dist_sign, float), (2,))
    kf = (0.5 * A.RHO * sz["area"] * CD_A)[:, None, None]
    mass = sz["mass"][:, None] * pl["mass"][None, :]
    lat = (lateral_per_torque(sz["alpha"], sz["L"], kappa) * (1.0 if couple else 0.0))[:, None]
    mix_args = tuple(sz[k][:, None] for k in ("kr", "ky", "T_hover", "Tmax"))
    v = np.transpose(gust_mean + gust_std * u0.T[None, :, :] + np.zeros((N, 1, 1)), (0, 2, 1))   # (N,E,2)
    a = np.exp(-A.DT / 0.5)
    k_step = int(T_WIND_STEP / A.DT)
    mean_after = gust_mean + wind_step * wsign[None]                                               # (1,E,2)
    th = np.zeros((N, E, 3)); om = np.zeros((N, E, 3)); tq = np.zeros((N, E, 3)); integ = np.zeros((N, E, 3))
    th_prev = np.zeros((N, E, 3)); om_prev = np.zeros((N, E, 3))
    pos = np.zeros((N, E, 2)) + off[None]; vel = np.zeros((N, E, 2)); pint = np.zeros((N, E, 2))
    s_ax = np.zeros((N, E, 2)); s_pos = np.zeros((N, E)); s_late = np.zeros((N, E)); s_yaw = np.zeros((N, E)); s_att = np.zeros((N, E))
    alive = np.ones((N, E), bool)
    for t in range(STEPS):
        m_t = gust_mean if t < k_step else mean_after
        v = a * v + (1 - a) * m_t + gust_std * np.sqrt(1 - a * a) * gust_n[:, :, t][None]
        ep = -(pos + pn[:, :, t][None]); ev = vel + vn[:, :, t][None]
        pint = np.clip(pint + ep * A.DT, -2.0, 2.0)
        acc = kpp * ep - kdp * ev + kip * pint
        psi = th_prev[:, :, 2] + ang_n[:, 2, t][None]
        c, s_ = np.cos(psi), np.sin(psi)
        ab_x = c * acc[:, :, 0] + s_ * acc[:, :, 1]
        ab_y = -s_ * acc[:, :, 0] + c * acc[:, :, 1]
        rp_ref = np.stack([np.clip(-ab_y / A.G, -TILT_CMD_MAX, TILT_CMD_MAX), np.clip(ab_x / A.G, -TILT_CMD_MAX, TILT_CMD_MAX)], -1)
        refv = np.concatenate([rp_ref, np.broadcast_to(yaw_ref[:, t][None, :, None], (N, E, 1))], -1)
        e = refv - (th_prev + ang_n[:, :, t][None])
        integ = np.clip(integ + e * A.DT, -0.3, 0.3)
        gy = om_prev + gyro_n[:, :, t][None]
        u = kp * e - kd * gy + ki * integ
        req = np.clip(u, -1, 1) * tmax_nom[:, None, :]
        mixed, s_rp, s_y = mix_priority(req, *mix_args, mode="hover")
        if sat is not None:
            sat[:, 0] += (s_rp < 1 - 1e-9).mean(axis=1) / STEPS
            sat[:, 1] += (s_y < 1 - 1e-9).mean(axis=1) / STEPS
        tq += (mixed * pl["tau"][None, :, None] - tq) * (A.DT / lag)
        tq = np.clip(tq, -tmax, tmax)
        om_prev, th_prev = om, th
        dist = np.zeros((N, E, 3)); dist[:, :, :2] = dsg * kg * v * np.abs(v)
        om = om + (tq + dist - np.cross(om, I * om)) / I * A.DT
        phi, tht, psi = th[:, :, 0], th[:, :, 1], th[:, :, 2]
        p, q, r = om[:, :, 0], om[:, :, 1], om[:, :, 2]
        th = th + np.stack([p + (q * np.sin(phi) + r * np.cos(phi)) * np.tan(tht), q * np.cos(phi) - r * np.sin(phi),
                            (q * np.sin(phi) + r * np.cos(phi)) / np.cos(tht)], -1) * A.DT
        sp, cp, st, cth, ss, cs = np.sin(phi), np.cos(phi), np.sin(tht), np.cos(tht), np.sin(psi), np.cos(psi)
        Tz = mass * A.G / np.maximum(cp * cth, 0.2)
        Fx, Fy = lat * tq[:, :, 1], lat * tq[:, :, 0]
        ax = (Tz * (cp * st * cs + sp * ss) + Fx * cth * cs + Fy * (sp * st * cs - cp * ss)) / mass
        ay = (Tz * (cp * st * ss - sp * cs) + Fx * cth * ss + Fy * (sp * st * ss + cp * cs)) / mass
        wind = kf * v * np.abs(v) / mass[:, :, None]
        vel = vel + np.stack([ax + wind[:, :, 1], ay + wind[:, :, 0]], -1) * A.DT
        pos = pos + vel * A.DT
        alive &= (np.abs(phi) < np.deg2rad(60.0)) & (np.abs(tht) < np.deg2rad(60.0)) & (np.abs(pos).max(axis=2) < DEAD_POS)
        dead = ~alive
        p2 = np.where(dead, DEAD_POS ** 2, (pos ** 2).sum(axis=2))
        s_pos += p2
        if t >= k_step:
            s_ax += np.where(dead[:, :, None], DEAD_POS ** 2 / 2, pos ** 2)
        if t >= k_step:
            s_late += p2
        s_yaw += np.where(dead, np.deg2rad(60.0) ** 2, (yaw_ref[:, t][None] - th[:, :, 2]) ** 2)
        s_att += np.where(dead, np.deg2rad(60.0) ** 2, ((rp_ref - th[:, :, :2]) ** 2).mean(axis=2))
    return dict(pos=np.sqrt(s_pos / STEPS).mean(1), pos_late=np.sqrt(s_late / (STEPS - k_step)).mean(1),
                yaw=np.rad2deg(np.sqrt(s_yaw / STEPS)).mean(1), att=np.rad2deg(np.sqrt(s_att / STEPS)).mean(1), dead=(~alive).mean(1),
                late_x=np.sqrt(s_ax[:, :, 0] / (STEPS - k_step)).mean(1), late_y=np.sqrt(s_ax[:, :, 1] / (STEPS - k_step)).mean(1))


def phys_gains(g):
    g = np.atleast_2d(g)
    return np.concatenate([A.ctrl_gains(g[:, :6], "pid"), 10 ** (POS_LO + np.clip(g[:, 6:9], 0, 1) * (POS_HI - POS_LO))], axis=1)


def score(x, episodes=8, seed=0, alpha_max=np.deg2rad(80.0), kappa_per_d=0.081, lam=0.03, couple=True, gust_std=4.0, wind_step=WIND_STEP, parts=False, sat=None, dist_sign=1.0, lever_scale=1.0):
    """x (N,12): arm length, propeller diameter, cant (unit cube), six attitude PID gains, three position gains (unit cube).
    J = -C - lam * P_hover / 100 W with C = sqrt((pos/0.10 m)^2 + (yaw/10 deg)^2); lam = 0.03 per 100 W is milestone 4's 0.3 deg per
    100 W, since one unit of C is 10 deg of yaw error. -99 when infeasible ($300 cap, propellers clear)."""
    x = np.atleast_2d(x)
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0])
    D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    alpha = alpha_max * np.clip(x[:, 2], 0, 1)
    sz = A.size(L, D, alpha, kappa_per_d=kappa_per_d, actuator="hover")
    out = rollout(sz, phys_gains(x[:, 3:12]), kappa_per_d * D, episodes, seed, gust_std, couple=couple, wind_step=wind_step, sat=sat, dist_sign=dist_sign, lever_scale=lever_scale)
    C = np.sqrt((out["pos"] / POS_SCALE_M) ** 2 + (out["yaw"] / YAW_SCALE_DEG) ** 2)
    J = np.where(sz["feasible"], -C - lam * sz["power"] / 100.0, -99.0)
    return (J, sz, out) if parts else (J, sz)

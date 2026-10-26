"""Three-axis quadrotor with canted rotors, here with position hold (codesign-aero-cant-poshold). Everything down to `score` is codesign-aero-cant-bound's; `rollout_pos` and `score_pos`
at the end add translation, an outer position loop and the lateral force a tilted rotor makes when attitude torque is commanded. Original docstring: Three-axis quadrotor with canted rotors for codesign-aero-cant. The attitude model, sizing closure, gust and plant randomisation are
codesign-aero-coupled's (Euler's rigid-body equations, ZYX kinematics, weak reaction-torque yaw axis); this file adds one design variable,
the rotor cant angle alpha (each rotor tilted about its own arm axis, alternating with spin direction, so the tangential thrust components cancel
at hover and add in yaw), and drops the residual network and gyroscopic compensation (the earlier project found both worth nothing).
Cant costs thrust (vertical component T cos alpha, so every rotor is sized for T/cos alpha) and buys yaw authority 2 dT (kappa cos alpha + r sin alpha).
All constants not in `size` are ASSUMED and swept in experiments/run.py."""
import numpy as np

G, RHO = 9.81, 1.2
ENDURANCE_MIN, TWR = 15.0, 2.0
PAYLOAD, ELEC = 0.25, 0.06
FM, ETA, DOD, WH_KG = 0.65, 0.75, 0.8, 150.0
COST_CAP = 300.0
DT, T_END = 0.002, 2.0
STEPS = int(T_END / DT)
L_RANGE, D_RANGE = (0.08, 0.30), (0.08, 0.25)
GAIN_LO, GAIN_HI = np.array([0.0, -2.0, -1.0]), np.array([2.7, 1.0, 2.0])
KAPPA = 0.016        # yaw reaction torque per newton of thrust, m (assumed; swept)
IZ_RATIO = 1.9       # Iz / Ix (assumed for a flat quad; swept, 1.0 removes gyroscopic coupling)
REF_DEG = (15.0, 15.0, 30.0)
ALPHA_MAX = np.deg2rad(35.0)


def size(L, D, alpha=0.0, tilt_loss=0.0):
    L, D, alpha = np.broadcast_arrays(np.asarray(L, float), np.asarray(D, float), np.asarray(alpha, float))
    ca, sa = np.cos(alpha), np.sin(alpha)
    m = np.full(L.shape, 1.0)
    for _ in range(60):
        T_hover = m * G / (4 * ca)
        P = 4 * T_hover ** 1.5 / np.sqrt(2 * RHO * np.pi * D ** 2 / 4) / (FM * ETA * (1 - tilt_loss * sa ** 2))
        wh = P * ENDURANCE_MIN / 60 / DOD
        Tmax = TWR * T_hover
        m_motor = 0.045 * (Tmax / 9.0) ** 1.2
        m_new = PAYLOAD + ELEC + wh / WH_KG + (0.05 + 0.8 * L) + 4 * m_motor
        m = np.minimum(0.5 * m + 0.5 * m_new, 20.0)
    T_hover = m * G / (4 * ca)
    Tmax = TWR * T_hover
    m_motor = 0.045 * (Tmax / 9.0) ** 1.2
    r = L / np.sqrt(2)
    inertia = 4 * m_motor * r ** 2 + (0.05 + 0.8 * L) * L ** 2 / 3 + (m - 4 * m_motor) * 0.04 ** 2
    tau_max = 4 * (Tmax - T_hover) * r * ca
    lag = 0.015 * (D / 0.127) ** 1.5
    cost = 4 * 12.0 * (Tmax / 9.0) ** 1.1 + 0.35 * wh + 60 * (0.05 + 0.8 * L) + 25.0
    area = 0.02 + 0.5 * L ** 2
    feasible = (np.sqrt(2) * L >= 1.05 * D) & (cost <= COST_CAP)
    return dict(mass=m, wh=wh, inertia=inertia, tau_max=tau_max, tau_yaw=2 * (Tmax - T_hover) * (KAPPA * ca + r * sa), alpha=alpha, lag=lag, cost=cost,
                area=area, lever=0.05 + 0.3 * L, feasible=feasible, L=L, D=D)


def gains_from_unit(u):
    return 10 ** (GAIN_LO + np.clip(u, 0, 1) * (GAIN_HI - GAIN_LO))


def reference(episodes, seed, ref_scale=1.0):
    """Independent +-ref step sequences on roll, pitch, yaw (4 segments of 0.5 s), gust and sensor noise per axis."""
    rng = np.random.default_rng(seed)
    signs = rng.choice([-1.0, 1.0], size=(episodes, 3, 4))
    ref = np.repeat(signs, STEPS // 4, axis=2) * np.deg2rad(np.array(REF_DEG) * ref_scale)[None, :, None]
    gust_n = rng.standard_normal((episodes, 2, STEPS))          # roll, pitch
    gyro_n = rng.standard_normal((episodes, 3, STEPS)) * 0.05
    ang_n = rng.standard_normal((episodes, 3, STEPS)) * 0.005
    u0 = rng.uniform(-1, 1, size=(episodes, 2))
    return ref, gust_n, gyro_n, ang_n, u0


PLANT_RANGES = {"wide": dict(tau=(0.7, 1.0), mass=(0.9, 1.3), lag=(1.0, 2.0))}


def plant_draw(kind, episodes, seed):
    if kind is None:
        return dict(tau=np.ones(episodes), mass=np.ones(episodes), lag=np.ones(episodes))
    rng = np.random.default_rng(seed + 31337)
    return {k: rng.uniform(*PLANT_RANGES[kind][k], size=episodes) for k in ("tau", "mass", "lag")}


def rollout(sz, gains, episodes=8, seed=0, gust_std=4.0, gust_mean=3.0, plant="wide", iz_ratio=None, kappa_scale=1.0, ref_scale=1.0, diag=None):
    """gains: (N,6) physical PID [kp,kd,ki roll/pitch; kp,kd,ki yaw].
    Returns combined RMS attitude error over the three axes (deg) per design, and per-axis RMS (N,3)."""
    iz_ratio = IZ_RATIO if iz_ratio is None else iz_ratio
    ref, gust_n, gyro_n, ang_n, u0 = reference(episodes, seed, ref_scale)
    N, E = gains.shape[0], episodes
    pid = gains[:, :6]
    kp = np.stack([pid[:, 0], pid[:, 0], pid[:, 3]], axis=1)[:, None, :]
    kd = np.stack([pid[:, 1], pid[:, 1], pid[:, 4]], axis=1)[:, None, :]
    ki = np.stack([pid[:, 2], pid[:, 2], pid[:, 5]], axis=1)[:, None, :]
    pl = plant_draw(plant, episodes, seed)
    I0 = sz["inertia"]
    Inom = np.stack([I0, I0, I0 * iz_ratio], axis=1)                       # (N,3)
    I = Inom[:, None, :] * pl["mass"][None, :, None]
    tmax_nom = np.stack([sz["tau_max"], sz["tau_max"], sz["tau_yaw"] * kappa_scale], axis=1)
    tmax = tmax_nom[:, None, :] * pl["tau"][None, :, None]
    lag = (sz["lag"][:, None] * pl["lag"][None, :])[:, :, None]
    kg = (0.5 * RHO * sz["area"] * sz["lever"])[:, None]
    v = gust_mean + gust_std * u0.T[None, :, :] + np.zeros((N, 1, 1))     # (N,2,E)
    v = np.transpose(v, (0, 2, 1))                                        # (N,E,2)
    a = np.exp(-DT / 0.5)
    th = np.zeros((N, E, 3)); om = np.zeros((N, E, 3)); tq = np.zeros((N, E, 3)); integ = np.zeros((N, E, 3))
    th_prev = np.zeros((N, E, 3)); om_prev = np.zeros((N, E, 3))
    sse = np.zeros((N, E, 3)); alive = np.ones((N, E), bool)
    for t in range(STEPS):
        v = a * v + (1 - a) * gust_mean + gust_std * np.sqrt(1 - a * a) * gust_n[:, :, t][None, :, :]
        e = ref[:, :, t][None, :, :] - (th_prev + ang_n[:, :, t][None, :, :])
        integ = np.clip(integ + e * DT, -0.3, 0.3)
        gy = om_prev + gyro_n[:, :, t][None, :, :]
        u = kp * e - kd * gy + ki * integ
        if diag is not None:      # peak share of the plant's torque limit taken by the gyroscopic term, per design
            diag[:] = np.maximum(diag, (np.abs(np.cross(om, I * om)) / tmax).max(axis=(1, 2)))
        cmd = np.clip(u, -1, 1) * tmax
        tq += (cmd - tq) * (DT / lag)
        tq = np.clip(tq, -tmax, tmax)
        om_prev, th_prev = om, th
        dist = np.zeros((N, E, 3)); dist[:, :, :2] = kg[:, :, None] * v * np.abs(v)
        domega = (tq + dist - np.cross(om, I * om)) / I
        om = om + domega * DT
        phi, tht = th[:, :, 0], th[:, :, 1]
        p, q, r = om[:, :, 0], om[:, :, 1], om[:, :, 2]
        ct = np.cos(tht)
        dth = np.stack([p + (q * np.sin(phi) + r * np.cos(phi)) * np.tan(tht),
                        q * np.cos(phi) - r * np.sin(phi),
                        (q * np.sin(phi) + r * np.cos(phi)) / ct], axis=-1)
        th = th + dth * DT
        err = np.where(alive[:, :, None], ref[:, :, t][None, :, :] - th, np.deg2rad(60.0))
        alive &= (np.abs(th[:, :, 0]) < np.deg2rad(60.0)) & (np.abs(th[:, :, 1]) < np.deg2rad(60.0))
        sse += err ** 2
    axis = np.rad2deg(np.sqrt(sse / STEPS)).mean(axis=1)                  # (N,3)
    return np.sqrt((axis ** 2).mean(axis=1)), axis


def score(x_design, gains_unit, episodes=8, seed=0, gust_std=4.0, plant="wide", iz_ratio=None, kappa_scale=1.0, ref_scale=1.0, per_axis=False, diag=None, alpha_max=ALPHA_MAX, tilt_loss=0.0):
    x_design = np.atleast_2d(x_design)
    L = L_RANGE[0] + x_design[:, 0] * (L_RANGE[1] - L_RANGE[0])
    D = D_RANGE[0] + x_design[:, 1] * (D_RANGE[1] - D_RANGE[0])
    alpha = alpha_max * np.clip(x_design[:, 2], 0, 1)
    sz = size(L, D, alpha, tilt_loss)
    g = np.atleast_2d(gains_unit)
    phys = np.concatenate([gains_from_unit(g[:, 0:3]), gains_from_unit(g[:, 3:6])], axis=1)
    rms, axis = rollout(sz, phys, episodes, seed, gust_std, plant=plant, iz_ratio=iz_ratio, kappa_scale=kappa_scale, ref_scale=ref_scale, diag=diag)
    J = np.where(sz["feasible"], -rms, -99.0)
    return (J, sz, axis) if per_axis else (J, sz)


# ---------------------------------------------------------------------------------------------------------------------------------------------
# Position hold. All constants below are ASSUMED unless a comment names a source.
POS_LO, POS_HI = np.array([-1.0, -1.0, -2.0]), np.array([1.0, 1.0, 0.5])    # log10 of outer-loop kp (1/s^2), kd (1/s), ki (1/(s^2 s))
POS_NOISE, VEL_NOISE = 0.02, 0.05      # m, m/s: GNSS-class position and velocity noise (assumed)
OFFSET = 0.5                           # initial horizontal offset, uniform +-m per axis (assumed)
TILT_CMD_MAX = np.deg2rad(20.0)
CD_A = 1.0                             # drag coefficient times the area in `size` (the torque model implicitly uses 1)
POS_SCALE_M, YAW_SCALE_DEG = 0.10, 10.0   # composite objective: sqrt((pos/0.10 m)^2 + (yaw/10 deg)^2); report both parts separately


def rotor_layout(alpha, L, sign=1.0):
    """Explicit four-rotor allocation for X-quad arms at 45, 135, 225, 315 deg with alternating spin sign s=(+,-,+,-)*sign.
    Each rotor's cant is about its arm axis, so its tangential force component is s * sin(alpha) * (tangent) with the tangent counter-clockwise, which makes
    the tangential yaw torque add to the reaction torque (kappa s T cos(alpha)). Returns the 4x? map from per-rotor thrust T_i to
    (Fx, Fy, Fz, tau_x, tau_y, tau_z) in the body frame (shape (6,4))."""
    phi = np.deg2rad([45.0, 135.0, 225.0, 315.0]); s = sign * np.array([1.0, -1.0, 1.0, -1.0])
    r = L / np.sqrt(2); x, y = r * np.cos(phi), r * np.sin(phi)
    tx, ty = -np.sin(phi), np.cos(phi)
    ca, sa = np.cos(alpha), np.sin(alpha)
    fx, fy, fz = s * sa * tx, s * sa * ty, ca * np.ones(4)
    tau_x = y * fz - 0 * fy                       # rotors lie in the body plane: z-offset zero
    tau_y = -x * fz
    tau_z = x * fy - y * fx + s * KAPPA * ca
    return np.stack([fx, fy, fz, tau_x, tau_y, tau_z])


def lateral_per_torque(alpha, L):
    """Closed form of what `rotor_layout` gives for a pure roll or pitch torque command: body force per unit torque, (dFy/dtau_x, dFx/dtau_y) = tan(alpha)/r."""
    return np.tan(alpha) / (L / np.sqrt(2))


def reference_pos(episodes, seed):
    rng = np.random.default_rng(seed + 555)
    off = rng.uniform(-OFFSET, OFFSET, size=(episodes, 2))
    pn = rng.standard_normal((episodes, 2, STEPS)) * POS_NOISE
    vn = rng.standard_normal((episodes, 2, STEPS)) * VEL_NOISE
    wy = rng.standard_normal((episodes, 2, STEPS))    # separate drag-gust draw would double the wind; unused, kept for stream stability
    return off, pn, vn


def rollout_pos(sz, gains, episodes=8, seed=0, gust_std=4.0, gust_mean=3.0, plant="wide", couple=True, ref_scale=1.0):
    """gains: (N,9): attitude PID roll/pitch (3), yaw (3), position kp, kd, ki (3), all unit-scaled by the caller to physical values.
    Task: hold the origin from a random horizontal offset in a gust, while yaw steps +-30 deg; roll and pitch references come from the position loop.
    Returns (rms_pos_m, rms_yaw_deg, rms_att_deg) per design. `couple` switches the lateral force from commanded roll/pitch torque off for an ablation."""
    ref, gust_n, gyro_n, ang_n, u0 = reference(episodes, seed, ref_scale)
    off, pn, vn = reference_pos(episodes, seed)
    N, E = gains.shape[0], episodes
    pid = gains[:, :6]; pg = gains[:, 6:9]
    kp = np.stack([pid[:, 0], pid[:, 0], pid[:, 3]], axis=1)[:, None, :]
    kd = np.stack([pid[:, 1], pid[:, 1], pid[:, 4]], axis=1)[:, None, :]
    ki = np.stack([pid[:, 2], pid[:, 2], pid[:, 5]], axis=1)[:, None, :]
    pl = plant_draw(plant, episodes, seed)
    I0 = sz["inertia"]
    I = np.stack([I0, I0, I0 * IZ_RATIO], axis=1)[:, None, :] * pl["mass"][None, :, None]
    tmax = np.stack([sz["tau_max"], sz["tau_max"], sz["tau_yaw"]], axis=1)[:, None, :] * pl["tau"][None, :, None]
    lag = (sz["lag"][:, None] * pl["lag"][None, :])[:, :, None]
    kg = (0.5 * RHO * sz["area"] * sz["lever"])[:, None]
    kf = (0.5 * RHO * sz["area"] * CD_A)[:, None]
    mass = sz["mass"][:, None] * pl["mass"][None, :]                          # (N,E)
    lat = (lateral_per_torque(sz["alpha"], sz["L"]) if couple else np.zeros_like(sz["alpha"]))[:, None]   # (N,1)
    v = gust_mean + gust_std * u0.T[None, :, :] + np.zeros((N, 1, 1))
    v = np.transpose(v, (0, 2, 1))
    a = np.exp(-DT / 0.5)
    th = np.zeros((N, E, 3)); om = np.zeros((N, E, 3)); tq = np.zeros((N, E, 3)); integ = np.zeros((N, E, 3))
    th_prev = np.zeros((N, E, 3)); om_prev = np.zeros((N, E, 3))
    pos = np.zeros((N, E, 2)) + off[None]; vel = np.zeros((N, E, 2)); pint = np.zeros((N, E, 2))
    s_pos = np.zeros((N, E)); s_yaw = np.zeros((N, E)); s_att = np.zeros((N, E)); alive = np.ones((N, E), bool)
    kpp, kdp, kip = (pg[:, 0, None, None], pg[:, 1, None, None], pg[:, 2, None, None])
    for t in range(STEPS):
        v = a * v + (1 - a) * gust_mean + gust_std * np.sqrt(1 - a * a) * gust_n[:, :, t][None, :, :]
        # outer position loop on noisy measurements -> roll/pitch references (small-angle, rotated by measured yaw)
        ep = -(pos + pn[:, :, t][None]); ev = vel + vn[:, :, t][None]
        pint = np.clip(pint + ep * DT, -2.0, 2.0)
        acc = kpp * ep - kdp * ev + kip * pint
        psi = th_prev[:, :, 2] + ang_n[:, 2, t][None, :]
        c, s_ = np.cos(psi), np.sin(psi)
        ab_x = c * acc[:, :, 0] + s_ * acc[:, :, 1]
        ab_y = -s_ * acc[:, :, 0] + c * acc[:, :, 1]
        rp_ref = np.stack([np.clip(-ab_y / G, -TILT_CMD_MAX, TILT_CMD_MAX), np.clip(ab_x / G, -TILT_CMD_MAX, TILT_CMD_MAX)], axis=-1)
        refv = np.concatenate([rp_ref, np.broadcast_to(ref[:, 2, t][None, :, None], (N, E, 1))], axis=-1)
        e = refv - (th_prev + ang_n[:, :, t][None, :, :])
        integ = np.clip(integ + e * DT, -0.3, 0.3)
        gy = om_prev + gyro_n[:, :, t][None, :, :]
        u = kp * e - kd * gy + ki * integ
        cmd = np.clip(u, -1, 1) * tmax
        tq += (cmd - tq) * (DT / lag)
        tq = np.clip(tq, -tmax, tmax)
        om_prev, th_prev = om, th
        dist = np.zeros((N, E, 3)); dist[:, :, :2] = kg[:, :, None] * v * np.abs(v)
        domega = (tq + dist - np.cross(om, I * om)) / I
        om = om + domega * DT
        phi, tht, psi = th[:, :, 0], th[:, :, 1], th[:, :, 2]
        p, q, r = om[:, :, 0], om[:, :, 1], om[:, :, 2]
        ct = np.cos(tht)
        dth = np.stack([p + (q * np.sin(phi) + r * np.cos(phi)) * np.tan(tht), q * np.cos(phi) - r * np.sin(phi), (q * np.sin(phi) + r * np.cos(phi)) / ct], axis=-1)
        th = th + dth * DT
        # translation: altitude held perfectly (vertical force balances weight), body lateral force from commanded torque, drag from the gust
        sp, cp, st, cth, ss, cs = np.sin(phi), np.cos(phi), np.sin(tht), np.cos(tht), np.sin(psi), np.cos(psi)
        Tz = mass * G / np.maximum(cp * cth, 0.2)
        Fx, Fy = lat * tq[:, :, 1], lat * tq[:, :, 0]
        ax = (Tz * (cp * st * cs + sp * ss) + Fx * cth * cs + Fy * (sp * st * cs - cp * ss)) / mass
        ay = (Tz * (cp * st * ss - sp * cs) + Fx * cth * ss + Fy * (sp * st * ss + cp * cs)) / mass
        wind = kf * v * np.abs(v) / mass[:, :, None]
        acc_w = np.stack([ax + wind[:, :, 1], ay + wind[:, :, 0]], axis=-1)
        vel = vel + acc_w * DT
        pos = pos + vel * DT
        alive &= (np.abs(phi) < np.deg2rad(60.0)) & (np.abs(tht) < np.deg2rad(60.0)) & (np.abs(pos).max(axis=2) < 5.0)
        dead = ~alive
        s_pos += np.where(dead, 5.0 ** 2, (pos ** 2).sum(axis=2))
        s_yaw += np.where(dead, np.deg2rad(60.0) ** 2, (ref[:, 2, t][None, :] - th[:, :, 2]) ** 2)
        s_att += np.where(dead, np.deg2rad(60.0) ** 2, (rp_ref - th[:, :, :2]) ** 2 @ np.ones(2) / 2)
    return (np.sqrt(s_pos / STEPS).mean(axis=1), np.rad2deg(np.sqrt(s_yaw / STEPS)).mean(axis=1), np.rad2deg(np.sqrt(s_att / STEPS)).mean(axis=1))


def score_pos(x_design, gains_unit, episodes=8, seed=0, gust_std=4.0, plant="wide", alpha_max=ALPHA_MAX, tilt_loss=0.0, couple=True, parts=False):
    """x_design (N,3): arm length, diameter, cant (unit). gains_unit (N,9): six attitude gains then kp, kd, ki of the position loop."""
    x_design = np.atleast_2d(x_design)
    L = L_RANGE[0] + x_design[:, 0] * (L_RANGE[1] - L_RANGE[0])
    D = D_RANGE[0] + x_design[:, 1] * (D_RANGE[1] - D_RANGE[0])
    alpha = alpha_max * np.clip(x_design[:, 2], 0, 1)
    sz = size(L, D, alpha, tilt_loss)
    g = np.atleast_2d(gains_unit)
    pos_g = 10 ** (POS_LO + np.clip(g[:, 6:9], 0, 1) * (POS_HI - POS_LO))
    phys = np.concatenate([gains_from_unit(g[:, 0:3]), gains_from_unit(g[:, 3:6]), pos_g], axis=1)
    pos_m, yaw_d, att_d = rollout_pos(sz, phys, episodes, seed, gust_std, plant=plant, couple=couple)
    J = np.where(sz["feasible"], -np.sqrt((pos_m / POS_SCALE_M) ** 2 + (yaw_d / YAW_SCALE_DEG) ** 2), -99.0)
    return (J, sz, pos_m, yaw_d) if parts else (J, sz)

"""Three-axis quadrotor with canted rotors for codesign-aero-cant. The attitude model, sizing closure, gust and plant randomisation are
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

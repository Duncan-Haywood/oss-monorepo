"""Copy of codesign-aero/aero.py with per-episode plant perturbations added to rollout (plant=...).
Inspection quadrotor: airframe (arm length L, prop diameter D) sized to a fixed endurance, plus a learned
roll-attitude policy u = kp*e - kd*gyro + ki*int(e) (gains found by CMA-ES policy search). All constants are
ASSUMED round numbers, not measurements of any product. Batched over designs x episodes with numpy."""
import numpy as np

G, RHO = 9.81, 1.2
ENDURANCE_MIN = 15.0          # required hover endurance
TWR = 2.0                     # motors sized so max thrust is TWR x hover thrust
PAYLOAD, ELEC = 0.25, 0.06    # kg
FM, ETA, DOD, WH_KG = 0.65, 0.75, 0.8, 150.0
COST_CAP = 300.0              # USD
DT, T_END = 0.002, 2.0
STEPS = int(T_END / DT)
L_RANGE, D_RANGE = (0.08, 0.30), (0.08, 0.25)
GAIN_LO, GAIN_HI = np.array([0.0, -2.0, -1.0]), np.array([2.7, 1.0, 2.0])   # log10 kp, kd, ki


def size(L, D):
    """Fixed-point mass closure. Returns dict of arrays (mass, battery Wh, inertia, torque limit, lag, cost, feasible)."""
    L, D = np.broadcast_arrays(np.asarray(L, float), np.asarray(D, float))
    m = np.full(L.shape, 1.0)
    for _ in range(60):
        T_hover = m * G / 4
        P = 4 * T_hover ** 1.5 / np.sqrt(2 * RHO * np.pi * D ** 2 / 4) / (FM * ETA)
        wh = P * ENDURANCE_MIN / 60 / DOD
        Tmax = TWR * T_hover
        m_motor = 0.045 * (Tmax / 9.0) ** 1.2
        m_new = PAYLOAD + ELEC + wh / WH_KG + (0.05 + 0.8 * L) + 4 * m_motor
        m = np.minimum(0.5 * m + 0.5 * m_new, 20.0)     # diverging (tiny-prop) designs stay finite and fail the cost cap
    T_hover = m * G / 4
    Tmax = TWR * T_hover
    m_motor = 0.045 * (Tmax / 9.0) ** 1.2
    r = L / np.sqrt(2)
    inertia = 4 * m_motor * r ** 2 + (0.05 + 0.8 * L) * L ** 2 / 3 + (m - 4 * m_motor) * 0.04 ** 2
    tau_max = 4 * (Tmax - T_hover) * r
    lag = 0.015 * (D / 0.127) ** 1.5
    cost = 4 * 12.0 * (Tmax / 9.0) ** 1.1 + 0.35 * wh + 60 * (0.05 + 0.8 * L) + 25.0
    area = 0.02 + 0.5 * L ** 2           # frame plus sensor pod area facing a gust
    feasible = (np.sqrt(2) * L >= 1.05 * D) & (cost <= COST_CAP)
    return dict(mass=m, wh=wh, inertia=inertia, tau_max=tau_max, lag=lag, cost=cost, area=area, lever=0.05 + 0.3 * L,
                feasible=feasible, L=L, D=D)


def gains_from_unit(u):
    return 10 ** (GAIN_LO + np.clip(u, 0, 1) * (GAIN_HI - GAIN_LO))


def reference(episodes, seed):
    """Roll set-point: +-15 deg steps every 0.5 s with random sign and random start phase; per-episode noise."""
    rng = np.random.default_rng(seed)
    signs = rng.choice([-1.0, 1.0], size=(episodes, 4))
    ref = np.repeat(signs, STEPS // 4, axis=1) * np.deg2rad(15)
    gust_n = rng.standard_normal((episodes, STEPS))
    gyro_n = rng.standard_normal((episodes, STEPS)) * 0.05
    ang_n = rng.standard_normal((episodes, STEPS)) * 0.005
    u0 = rng.uniform(-1, 1, size=episodes)
    return ref, gust_n, gyro_n, ang_n, u0


PLANT_RANGES = {   # widened randomisation (assumed): multipliers drawn uniformly per episode
    "narrow": dict(tau=(0.9, 1.0), mass=(0.95, 1.15), lag=(1.0, 1.4)),
    "wide": dict(tau=(0.7, 1.0), mass=(0.9, 1.3), lag=(1.0, 2.0)),
}


def plant_draw(kind, episodes, seed):
    """Per-episode multipliers (tau_max, mass -> inertia, motor lag). kind None means the nominal plant."""
    if kind is None:
        return dict(tau=np.ones(episodes), mass=np.ones(episodes), lag=np.ones(episodes))
    rng = np.random.default_rng(seed + 31337)
    return {k: rng.uniform(*PLANT_RANGES[kind][k], size=episodes) for k in ("tau", "mass", "lag")}


def rollout(sz, gains, episodes=8, seed=0, gust_std=4.0, gust_mean=3.0, plant=None):
    """sz: dict of (N,) arrays; gains (N,3) physical. Returns RMS roll tracking error in degrees, shape (N,)."""
    ref, gust_n, gyro_n, ang_n, u0 = reference(episodes, seed)
    N, E = gains.shape[0], episodes
    th = np.zeros((N, E)); om = np.zeros((N, E)); tq = np.zeros((N, E)); integ = np.zeros((N, E))
    pl = plant_draw(plant, episodes, seed)
    I = sz["inertia"][:, None] * pl["mass"][None, :]; tmax = sz["tau_max"][:, None] * pl["tau"][None, :]
    lag = sz["lag"][:, None] * pl["lag"][None, :]
    kg = (0.5 * RHO * 1.0 * sz["area"] * sz["lever"])[:, None]
    kp, kd, ki = (gains[:, i][:, None] for i in range(3))
    v = np.zeros((N, E)) + gust_mean + gust_std * u0[None, :]   # OU gust speed (tau = 0.5 s)
    a = np.exp(-DT / 0.5)
    sse = np.zeros((N, E)); alive = np.ones((N, E), bool)
    om_prev = np.zeros((N, E)); th_prev = np.zeros((N, E))
    for t in range(STEPS):
        v = a * v + (1 - a) * gust_mean + gust_std * np.sqrt(1 - a * a) * gust_n[:, t][None, :]
        e_meas = ref[:, t][None, :] - (th_prev + ang_n[:, t][None, :])
        integ = np.clip(integ + e_meas * DT, -0.3, 0.3)
        u = kp * e_meas - kd * (om_prev + gyro_n[:, t][None, :]) + ki * integ
        cmd = np.clip(u, -1, 1) * tmax
        tq += (cmd - tq) * (DT / lag)
        tq = np.clip(tq, -tmax, tmax)
        om_prev, th_prev = om, th                    # one-step sensing delay
        om = om + (tq + kg * v * np.abs(v)) / I * DT
        th = th + om * DT
        err = np.where(alive, ref[:, t][None, :] - th, np.deg2rad(60.0))
        alive &= np.abs(th) < np.deg2rad(60.0)
        sse += err ** 2
    return np.rad2deg(np.sqrt(sse / STEPS)).mean(axis=1)


def score(x_design, gains_unit, episodes=8, seed=0, gust_std=4.0, plant=None):
    """x_design (N,2) in [0,1]; gains_unit (N,3) in [0,1]. Returns (J, sizing): J = -RMS error (deg), -99 if infeasible."""
    x_design = np.atleast_2d(x_design)
    L = L_RANGE[0] + x_design[:, 0] * (L_RANGE[1] - L_RANGE[0])
    D = D_RANGE[0] + x_design[:, 1] * (D_RANGE[1] - D_RANGE[0])
    sz = size(L, D)
    rms = rollout(sz, gains_from_unit(np.atleast_2d(gains_unit)), episodes, seed, gust_std, plant=plant)
    return np.where(sz["feasible"], -rms, -99.0), sz

"""codesign-cant (milestone 1): the simulator of codesign-aero-cant-twrceil, copied unchanged except for the `actuator` switch in `size` and `score`.
actuator="prior" reproduces the earlier projects; "hover" and "free" take the per-axis torque limits from the full allocation in allocation.py.
Original docstring: codesign-aero-cant-twrceil: as codesign-aero-cant-propdata, plus thrust-to-weight (motor headroom) as an optional design variable.
Three-axis quadrotor with canted rotors for codesign-aero-cant. The attitude model, sizing closure, gust and plant randomisation are
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


TWR_RANGE = (1.5, 4.0)   # thrust-to-weight range when motor headroom is a design variable (the fixed value elsewhere is TWR)


def size(L, D, alpha=0.0, tilt_loss=0.0, kappa_per_d=None, twr=None, actuator="prior"):
    L, D, alpha, twr = np.broadcast_arrays(np.asarray(L, float), np.asarray(D, float), np.asarray(alpha, float), np.asarray(TWR if twr is None else twr, float))
    ca, sa = np.cos(alpha), np.sin(alpha)
    m = np.full(L.shape, 1.0)
    for _ in range(60):
        T_hover = m * G / (4 * ca)
        P = 4 * T_hover ** 1.5 / np.sqrt(2 * RHO * np.pi * D ** 2 / 4) / (FM * ETA * (1 - tilt_loss * sa ** 2))
        wh = P * ENDURANCE_MIN / 60 / DOD
        Tmax = twr * T_hover
        m_motor = 0.045 * (Tmax / 9.0) ** 1.2
        m_new = PAYLOAD + ELEC + wh / WH_KG + (0.05 + 0.8 * L) + 4 * m_motor
        m = np.minimum(0.5 * m + 0.5 * m_new, 20.0)
    T_hover = m * G / (4 * ca)
    Tmax = twr * T_hover
    m_motor = 0.045 * (Tmax / 9.0) ** 1.2
    r = L / np.sqrt(2)
    kappa = KAPPA if kappa_per_d is None else kappa_per_d * D   # Q/T = (Cp/Ct) D / (2 pi): reaction torque per newton grows with the propeller diameter
    inertia = 4 * m_motor * r ** 2 + (0.05 + 0.8 * L) * L ** 2 / 3 + (m - 4 * m_motor) * 0.04 ** 2
    tau_max = 4 * (Tmax - T_hover) * r * ca
    tau_yaw = 2 * (Tmax - T_hover) * (kappa * ca + r * sa)
    if actuator != "prior":   # per-axis limits from the full four-rotor allocation (allocation.closed_form; checked against a linear programme in tests)
        from .allocation import closed_form
        tau_max, tau_yaw, _ = closed_form(alpha, L, kappa, T_hover, Tmax, actuator)
    P_hover = 4 * T_hover ** 1.5 / np.sqrt(2 * RHO * np.pi * D ** 2 / 4) / (FM * ETA * (1 - tilt_loss * sa ** 2))   # electrical hover power, W (milestone 2 prices it)
    lag = 0.015 * (D / 0.127) ** 1.5
    cost = 4 * 12.0 * (Tmax / 9.0) ** 1.1 + 0.35 * wh + 60 * (0.05 + 0.8 * L) + 25.0
    area = 0.02 + 0.5 * L ** 2
    feasible = (np.sqrt(2) * L >= 1.05 * D) & (cost <= COST_CAP)
    return dict(mass=m, wh=wh, inertia=inertia, tau_max=tau_max, tau_yaw=tau_yaw, alpha=alpha, lag=lag, cost=cost,
                area=area, lever=0.05 + 0.3 * L, feasible=feasible, L=L, D=D, power=P_hover, T_hover=T_hover, Tmax=Tmax,
                kr=L * ca - kappa * sa, ky=L * sa + kappa * ca)


def gains_from_unit(u):
    return 10 ** (GAIN_LO + np.clip(u, 0, 1) * (GAIN_HI - GAIN_LO))


# Milestone 4: log10 ranges of the six tuned parameters of the two stronger attitude laws (the PID law keeps GAIN_LO/HI per axis group).
# indi: [K_att rp (1/s), K_rate rp (1/s), K_att yaw, K_rate yaw, filter cut-off (Hz), effectiveness scale on the nominal inertia]
# geo:  [k_R rp (1/s^2), k_Omega rp (1/s), k_I rp (1/s^3), k_R yaw, k_Omega yaw, k_I yaw]
CTRL_LO = {"indi": np.array([0.0, 0.5, 0.0, 0.5, 0.7, -0.3]), "geo": np.array([0.0, 0.0, -1.0, 0.0, 0.0, -1.0])}
CTRL_HI = {"indi": np.array([2.0, 2.5, 2.0, 2.5, 2.0, 0.3]), "geo": np.array([4.0, 2.5, 3.0, 4.0, 2.5, 3.0])}


def ctrl_gains(u, ctrl):
    """Unit-cube parameters (N,6) to physical controller parameters for ctrl in {"pid", "indi", "geo"}."""
    u = np.atleast_2d(u)
    if ctrl == "pid":
        return np.concatenate([gains_from_unit(u[:, 0:3]), gains_from_unit(u[:, 3:6])], axis=1)
    return 10 ** (CTRL_LO[ctrl] + np.clip(u, 0, 1) * (CTRL_HI[ctrl] - CTRL_LO[ctrl]))


def eul2R(phi, tht, psi):
    """ZYX Euler angles (any equal shapes) to body-to-world rotation matrices, shape (..., 3, 3)."""
    cf, sf, ct, st, cp, sp = np.cos(phi), np.sin(phi), np.cos(tht), np.sin(tht), np.cos(psi), np.sin(psi)
    return np.stack([np.stack([ct * cp, sf * st * cp - cf * sp, cf * st * cp + sf * sp], -1),
                     np.stack([ct * sp, sf * st * sp + cf * cp, cf * st * sp - sf * cp], -1),
                     np.stack([-st, sf * ct, cf * ct], -1)], -2)


def so3_error(th, ref):
    """Lee et al. (2010) attitude error e_R = vee(Rd^T R - R^T Rd) / 2 for ZYX angles th (actual) and ref (desired), (..., 3)."""
    R, Rd = eul2R(th[..., 0], th[..., 1], th[..., 2]), eul2R(ref[..., 0], ref[..., 1], ref[..., 2])
    M = np.swapaxes(Rd, -1, -2) @ R
    M = 0.5 * (M - np.swapaxes(M, -1, -2))
    return np.stack([M[..., 2, 1], M[..., 0, 2], M[..., 1, 0]], -1)


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


def rollout(sz, gains, episodes=8, seed=0, gust_std=4.0, gust_mean=3.0, plant="wide", iz_ratio=None, kappa_scale=1.0, ref_scale=1.0, diag=None, mixer="box", sat=None, ctrl="pid"):
    """ctrl="pid" (milestones 0-2): per-axis PID on Euler-angle error, output a share of the torque limit.
    ctrl="indi" (Smeur et al. 2016): attitude P loop -> rate P loop -> desired angular acceleration nu; torque increment
    I_nom * g * (nu - filtered angular acceleration) added to the filtered estimate of the delivered torque (nominal actuator
    model: the design's nominal lag and limits, which the plant randomisation then perturbs); gyro and torque estimate pass the
    same two-pole low-pass filter. ctrl="geo" (Lee et al. 2010): tau = I_nom (-k_R e_R - k_Omega Omega - k_I int e_R) + Omega x I_nom Omega
    with the SO(3) error e_R. Both use the measured (noisy, one-step-old) angles and rates the PID law uses.
mixer="box": each axis clipped to its own pure-torque limit (milestones 0-1); "prio" or "prio_free": the request is
    passed through allocation.mix_priority (one shared thrust polytope, roll and pitch first; collective held or free).
    gains: (N,6) physical PID [kp,kd,ki roll/pitch; kp,kd,ki yaw].
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
    if mixer != "box":
        from .allocation import mix_priority
        mix_args = tuple(sz[k][:, None] for k in ("kr", "ky", "T_hover", "Tmax"))
    if ctrl == "geo":
        gR = np.stack([gains[:, 0], gains[:, 0], gains[:, 3]], 1)[:, None, :]
        gW = np.stack([gains[:, 1], gains[:, 1], gains[:, 4]], 1)[:, None, :]
        gI = np.stack([gains[:, 2], gains[:, 2], gains[:, 5]], 1)[:, None, :]
        integ_R = np.zeros((N, E, 3))
    elif ctrl == "indi":
        ka_ = np.stack([gains[:, 0], gains[:, 0], gains[:, 2]], 1)[:, None, :]
        kr_ = np.stack([gains[:, 1], gains[:, 1], gains[:, 3]], 1)[:, None, :]
        af = (1 - np.exp(-2 * np.pi * gains[:, 4] * DT))[:, None, None]
        geff = gains[:, 5][:, None, None]
        lag_nom = sz["lag"][:, None, None]
        w1 = np.zeros((N, E, 3)); w2 = np.zeros((N, E, 3)); w2_prev = np.zeros((N, E, 3))
        q1 = np.zeros((N, E, 3)); q2 = np.zeros((N, E, 3)); tq_hat = np.zeros((N, E, 3))
    th = np.zeros((N, E, 3)); om = np.zeros((N, E, 3)); tq = np.zeros((N, E, 3)); integ = np.zeros((N, E, 3))
    th_prev = np.zeros((N, E, 3)); om_prev = np.zeros((N, E, 3))
    sse = np.zeros((N, E, 3)); alive = np.ones((N, E), bool)
    for t in range(STEPS):
        v = a * v + (1 - a) * gust_mean + gust_std * np.sqrt(1 - a * a) * gust_n[:, :, t][None, :, :]
        e = ref[:, :, t][None, :, :] - (th_prev + ang_n[:, :, t][None, :, :])
        integ = np.clip(integ + e * DT, -0.3, 0.3)
        gy = om_prev + gyro_n[:, :, t][None, :, :]
        if ctrl == "pid":
            u = kp * e - kd * gy + ki * integ
        elif ctrl == "geo":
            eR = so3_error(th_prev + ang_n[:, :, t][None, :, :], np.broadcast_to(ref[:, :, t][None, :, :], th.shape))
            integ_R = np.clip(integ_R + eR * DT, -0.3, 0.3)
            tau = Inom[:, None, :] * (-gR * eR - gW * gy - gI * integ_R) + np.cross(gy, Inom[:, None, :] * gy)
            u = tau / tmax_nom[:, None, :]
        else:   # indi
            w1 += (gy - w1) * af; w2 += (w1 - w2) * af
            wdot = (w2 - w2_prev) / DT; w2_prev = w2.copy()
            q1 += (tq_hat - q1) * af; q2 += (q1 - q2) * af
            nu = kr_ * (ka_ * e - gy)
            tau = q2 + Inom[:, None, :] * geff * (nu - wdot)
            u = tau / tmax_nom[:, None, :]
        if diag is not None:      # peak share of the plant's torque limit taken by the gyroscopic term, per design
            diag[:] = np.maximum(diag, (np.abs(np.cross(om, I * om)) / tmax).max(axis=(1, 2)))
        if mixer == "box":
            cmd = np.clip(u, -1, 1) * tmax
        else:
            req = np.clip(u, -1, 1) * tmax_nom[:, None, :]
            mixed, s_rp, s_y = mix_priority(req, *mix_args, mode="hover" if mixer == "prio" else "free")
            cmd = mixed * pl["tau"][None, :, None]
            if sat is not None:   # share of steps with roll/pitch (column 0) or yaw (column 1) scaled down, per design
                sat[:, 0] += (s_rp < 1 - 1e-9).mean(axis=1) / STEPS
                sat[:, 1] += (s_y < 1 - 1e-9).mean(axis=1) / STEPS
        if ctrl == "indi":   # the controller's model of the delivered torque: what it commanded, through the nominal lag and limits
            cmd_nom = np.clip(u, -1, 1) * tmax_nom[:, None, :] if mixer == "box" else mixed
            tq_hat = np.clip(tq_hat + (cmd_nom - tq_hat) * (DT / lag_nom), -tmax_nom[:, None, :], tmax_nom[:, None, :])
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


def score(x_design, gains_unit, episodes=8, seed=0, gust_std=4.0, plant="wide", iz_ratio=None, kappa_scale=1.0, ref_scale=1.0, per_axis=False, diag=None, alpha_max=ALPHA_MAX, tilt_loss=0.0, kappa_per_d=None, twr_free=False, twr_max=None, actuator="prior", mixer="box", lam=0.0, sat=None, ctrl="pid"):
    """J = -(held-out RMS attitude error, deg) - lam * hover power / 100 W; -99 when infeasible. lam (deg per 100 W) prices energy (milestone 2)."""
    x_design = np.atleast_2d(x_design)
    L = L_RANGE[0] + x_design[:, 0] * (L_RANGE[1] - L_RANGE[0])
    D = D_RANGE[0] + x_design[:, 1] * (D_RANGE[1] - D_RANGE[0])
    alpha = alpha_max * np.clip(x_design[:, 2], 0, 1)
    twr = TWR_RANGE[0] + ((TWR_RANGE[1] if twr_max is None else twr_max) - TWR_RANGE[0]) * np.clip(x_design[:, 3], 0, 1) if twr_free else None   # column 3 of x_design only when twr_free
    sz = size(L, D, alpha, tilt_loss, kappa_per_d, twr, actuator)
    sz['twr'] = np.broadcast_to(TWR if twr is None else twr, L.shape)
    phys = ctrl_gains(gains_unit, ctrl)
    rms, axis = rollout(sz, phys, episodes, seed, gust_std, plant=plant, iz_ratio=iz_ratio, kappa_scale=kappa_scale, ref_scale=ref_scale, diag=diag, mixer=mixer, sat=sat, ctrl=ctrl)
    J = np.where(sz["feasible"], -rms - lam * sz["power"] / 100.0, -99.0)
    return (J, sz, axis) if per_axis else (J, sz)

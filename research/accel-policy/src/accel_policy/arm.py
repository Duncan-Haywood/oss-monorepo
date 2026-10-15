"""Stylised vertical-plane two-link arm (same rod model and assumed masses as research/robofab-armaccel,
re-implemented here in NumPy so the project is self-contained). q1: shoulder elevation, q2: elbow relative angle."""
import numpy as np

G = 9.81
L1 = L2 = 0.12      # m (assumed)
M1 = M2 = 0.12      # kg: 1 kg per metre of link (assumed)
MP = 0.1            # kg gripper + part at the wrist (assumed)
TAU_MAX = 5.0       # N m per joint (assumed)


def mass_matrix(q2):
    lc1, lc2 = L1 / 2, L2 / 2
    i1, i2 = M1 * L1 ** 2 / 12, M2 * L2 ** 2 / 12
    c = np.cos(q2)
    m11 = M1 * lc1 ** 2 + i1 + M2 * (L1 ** 2 + lc2 ** 2 + 2 * L1 * lc2 * c) + i2 + MP * (L1 ** 2 + L2 ** 2 + 2 * L1 * L2 * c)
    m12 = M2 * (lc2 ** 2 + L1 * lc2 * c) + i2 + MP * (L2 ** 2 + L1 * L2 * c)
    m22 = M2 * lc2 ** 2 + i2 + MP * L2 ** 2
    return np.array([[m11, m12], [m12, m22]])


def bias(q, qd):
    """Coriolis/centripetal plus gravity torques."""
    q1, q2 = q
    d1, d2 = qd
    h = -(M2 * L1 * L2 / 2 + MP * L1 * L2) * np.sin(q2)
    g2 = (M2 * L2 / 2 + MP * L2) * G * np.cos(q1 + q2)
    g1 = (M1 * L1 / 2 + M2 * L1 + MP * L1) * G * np.cos(q1) + g2
    return np.array([h * (2 * d1 * d2 + d2 * d2) + g1, -h * d1 * d1 + g2])


def inverse_dynamics(q, qd, qdd):
    return mass_matrix(q[1]) @ qdd + bias(q, qd)


def forward_dynamics(q, qd, tau):
    return np.linalg.solve(mass_matrix(q[1]), tau - bias(q, qd))


def step(q, qd, tau, dt):
    """Semi-implicit Euler step of the plant."""
    qdd = forward_dynamics(q, qd, tau)
    qd = qd + dt * qdd
    return q + dt * qd, qd


def min_jerk(qa, qb, T, t):
    s = min(max(t / T, 0.0), 1.0)
    p = 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5
    v = (30 * s ** 2 - 60 * s ** 3 + 30 * s ** 4) / T
    a = (60 * s - 180 * s ** 2 + 120 * s ** 3) / T ** 2
    if t >= T:
        v = a = 0.0
    d = qb - qa
    return qa + d * p, d * v, d * a


KP, KD = 900.0, 60.0   # teacher gains (1/s^2, 1/s), assumed


def teacher(q, qd, qr, qdr, qddr):
    """Computed-torque PD with saturation: the controller the network imitates."""
    acc = qddr + KP * (qr - q) + KD * (qdr - qd)
    return np.clip(inverse_dynamics(q, qd, acc), -TAU_MAX, TAU_MAX)


def features(q, qd, qr, qdr):
    """Network input: tracking errors and the reference state (all roughly unit scale), 8 numbers."""
    return np.array([q[0], q[1], qd[0] / 5, qd[1] / 5, (qr - q)[0] * 5, (qr - q)[1] * 5, (qdr - qd)[0] / 5, (qdr - qd)[1] / 5])


def random_move(rng):
    qa = np.array([rng.uniform(0.2, 1.2), rng.uniform(0.4, 2.2)])
    qb = np.array([rng.uniform(0.2, 1.2), rng.uniform(0.4, 2.2)])
    return qa, qb, rng.uniform(0.25, 0.6)


def rollout(controller, qa, qb, T, Ts, latency, dt=0.0005, tail=0.15, log=None):
    """Run a move with a sampled controller, integrating event by event so latencies shorter than `dt` are exact.
    Every Ts the controller reads the state; its torque is applied `latency` seconds later (the previous torque
    is held until then) and held until the next result arrives. controller(q, qd, qr, qdr, qddr) -> torque.
    Requires latency <= Ts (the deadline). Returns (RMS joint error in rad, peak error); (inf, inf) if it diverges.
    If `log` is a list, (q, qd, qr, qdr, qddr) at each sample is appended (used for DAgger)."""
    q, qd = qa.copy(), np.zeros(2)
    total = T + tail
    tau_hold = inverse_dynamics(q, qd, np.zeros(2)).clip(-TAU_MAX, TAU_MAX)
    pending, t_apply = None, None
    t, next_sample = 0.0, 0.0
    err2, peak, w = 0.0, 0.0, 0.0
    while t < total - 1e-12:
        if pending is not None and t >= t_apply - 1e-12:      # apply first, so latency == Ts still works
            tau_hold, pending = pending, None
        if t >= next_sample - 1e-12:
            qr, qdr, qddr = min_jerk(qa, qb, T, t)
            if log is not None:
                log.append((q.copy(), qd.copy(), qr, qdr, qddr))
            pending = np.clip(controller(q, qd, qr, qdr, qddr), -TAU_MAX, TAU_MAX)
            t_apply = t + latency
            next_sample += Ts
            if pending is not None and t >= t_apply - 1e-12:
                tau_hold, pending = pending, None
        nxt = min(t + dt, next_sample, total)
        if pending is not None:
            nxt = min(nxt, t_apply)
        h = nxt - t
        if h <= 0:
            h = 1e-9
        q, qd = step(q, qd, tau_hold, h)
        t += h
        e = np.abs(q - min_jerk(qa, qb, T, t)[0])
        err2 += float(e @ e) / 2 * h
        w += h
        peak = max(peak, float(e.max()))
        if not np.all(np.isfinite(q)) or peak > 10:
            return float("inf"), float("inf")
    return float(np.sqrt(err2 / w)), peak

"""Batch simulators for a person-led sheet lift with a robot following (planar, x-z), two plant models.

Plant A (the training simulator) is the rigid-rod sheet of buildbot-cohold: one angle about the person's pin.
Plant B (the held-out simulator) differs in what the robot's controller has to live with: the sheet is two rigid
halves joined by a torsional spring-damper (a flexing board), the robot's force command goes through a first-order
actuator lag, and its position/velocity feedback arrives late. Both integrate N episodes at once (numpy arrays).

Skill = (K, B, Ki): stiffness N/m, damping N s/m and integral gain N/(m s) of an impedance law around a reference
that copies the person's end after `lag`, plus a feed-forward of `ffr` x half the sheet's weight (the robot only
estimates the sheet's mass, so ffr is a random error in the world, not a parameter of the skill).
"""
import numpy as np

G = 9.81
L = 2.44            # 8 ft sheet
LIFT = 0.3          # the person raises their end 0.3 m
NIOSH_KG = 51 * 0.45359237   # NIOSH load constant, Waters et al. 1993


def _mj(s):
    s = np.clip(s, 0.0, 1.0)
    return 10 * s**3 - 15 * s**4 + 6 * s**5


def _path(t, T):
    """Person's end: height, speed, acceleration of a minimum-jerk lift of LIFT in T seconds (t may be < 0)."""
    s = np.clip(t / T, 0.0, 1.0)
    z = LIFT * (10 * s**3 - 15 * s**4 + 6 * s**5)
    v = LIFT * (30 * s**2 - 60 * s**3 + 30 * s**4) / T
    a = LIFT * (60 * s - 180 * s**2 + 120 * s**3) / T**2
    return z, v, a


def draw_world(rng, n, kind="A"):
    """Random conditions for n episodes. Ranges are mine, not measured; see README."""
    w = {
        "m": rng.uniform(6.0, 23.0, n),                     # sheet kg: 6 kg (G1 limit in buildbot-cohold) to 23 kg drywall
        "T": np.exp(rng.uniform(np.log(1.0), np.log(4.0), n)),   # lift seconds
        "lag": rng.uniform(0.0, 0.5, n),                    # how late the robot learns where the person's end is
        "ffr": rng.uniform(0.8, 1.2, n),                    # feed-forward / true half weight
        "bias": rng.normal(0.0, 0.01, n),                   # reference height error, m
    }
    if kind == "B":
        w["kflex"] = np.exp(rng.uniform(np.log(150.0), np.log(6000.0), n))    # N m / rad at the sheet's midline
        w["delay"] = rng.uniform(0.0, 0.03, n)              # feedback delay s
        w["tau_a"] = rng.uniform(0.005, 0.05, n)            # force actuator time constant s
    return w


def nominal_world(n, m=22.0, kind="A"):
    w = {"m": np.full(n, m), "T": np.full(n, 2.0), "lag": np.full(n, 0.2), "ffr": np.ones(n), "bias": np.zeros(n)}
    if kind == "B":
        w.update(kflex=np.full(n, 600.0), delay=np.full(n, 0.01), tau_a=np.full(n, 0.02))
    return w


def _controller(Rx, Rz, Rvx, Rvz, refz, ffz, K, B, Ki, Iz):
    Fx = K * (L - Rx) - B * Rvx
    Fz = ffz + K * (refz - Rz) - B * Rvz + Ki * Iz
    return Fx, Fz


def simulate(world, policy, kind="A", dt=1e-3, extra=1.5, t_end=None, settle=1.0):
    """Integrate len(world['m']) episodes. policy = dict of arrays/scalars K, B, Ki (broadcast to episodes).

    The first `settle` seconds hold the sheet still (plant B's board sags to rest under heavy damping) and are not scored;
    the lift starts at t = settle. t_end, if given, is the scored horizon after the lift starts.
    Returns dict of per-episode metrics: peak_tilt_deg, end_tilt_deg, person_kg_peak, ok (finite and bounded).
    Tilt is the chord from the person's end to the robot's end (the rod angle in plant A).
    """
    m, T, lag = world["m"], world["T"], world["lag"]
    n = m.size
    K, B, Ki = (np.broadcast_to(np.asarray(policy[k], float), (n,)) for k in ("K", "B", "Ki"))
    ffz = world["ffr"] * 0.5 * m * G
    t_end = t_end if t_end is not None else float((T + lag).max()) + extra
    steps = int((t_end + settle) / dt)
    two = kind == "B"
    if two:
        kf, cf = world["kflex"], 0.05 * np.sqrt(world["kflex"] * m * L * L / 12.0)  # light structural damping
        dly = np.round(world["delay"] / dt).astype(int)
        ta = world["tau_a"]
        l = L / 2.0
        mi = m / 2.0
        Ii = mi * l * l / 12.0
        th1 = np.zeros(n); th2 = np.zeros(n); w1 = np.zeros(n); w2 = np.zeros(n)
        Fa = np.stack([np.zeros(n), ffz], 0)       # actuator output starts at the hold force
        RING = int(dly.max()) + 2
        ring = np.zeros((RING, 4, n))
    else:
        I = m * L * L / 3.0
        th = np.zeros(n); w = np.zeros(n)
    Iz = np.zeros(n)
    peak_tilt = np.zeros(n); peak_p = np.zeros(n); tilt = np.zeros(n)
    for i in range(steps):
        t = i * dt - settle
        scored = t >= 0.0
        zP, vP, aP = _path(np.full(n, t), T)
        zref, _, _ = _path(t - lag, T)
        zref = zref + world["bias"]
        if not two:
            c, s = np.cos(th), np.sin(th)
            Rx, Rz = L * c, zP + L * s
            Rvx, Rvz = -L * s * w, vP + L * c * w
            Fx, Fz = _controller(Rx, Rz, Rvx, Rvz, zref, ffz, K, B, Ki, Iz)
            alpha = (-m * (G + aP) * (L / 2) * c + L * (c * Fz - s * Fx)) / I
            acm_x = -(L / 2) * (s * alpha + c * w * w)
            acm_z = aP + (L / 2) * (c * alpha - s * w * w)
            FPz = m * acm_z + m * G - Fz
            w = w + alpha * dt
            th = th + w * dt
            tilt = th
            Iz = Iz + (zref - Rz) * dt
        else:
            c1, s1, c2, s2 = np.cos(th1), np.sin(th1), np.cos(th2), np.sin(th2)
            Rx = l * c1 + l * c2
            Rz = zP + l * s1 + l * s2
            Rvx = -l * s1 * w1 - l * s2 * w2
            Rvz = vP + l * c1 * w1 + l * c2 * w2
            ring[i % RING] = (Rx, Rz, Rvx, Rvz)
            j = (i - dly) % RING
            idx = np.arange(n)
            mx, mz, mvx, mvz = ring[j, :, idx].T        # delayed measurement (zeros before the first sample)
            Fxc, Fzc = _controller(mx, mz, mvx, mvz, zref, ffz, K, B, Ki, Iz)
            Fa = Fa + (np.stack([Fxc, Fzc], 0) - Fa) * (dt / ta)
            Fx, Fz = Fa
            # generalised coordinates (th1, th2): M q'' = sum Jc^T m (g - aP + rho) + J_R^T F_R + spring
            # body 1 centre: P + (l/2) e1 ; body 2 centre: P + l e1 + (l/2) e2
            M11 = mi * (l / 2) ** 2 + mi * l * l + Ii
            M22 = mi * (l / 2) ** 2 + Ii
            M12 = mi * l * (l / 2) * (c1 * c2 + s1 * s2)
            # rho_i = sum_k (arm vector)(w_k^2); acceleration a_i = aP + J q'' - rho_i
            rho1 = np.stack([(l / 2) * c1 * w1**2, (l / 2) * s1 * w1**2], 0)
            rho2 = np.stack([l * c1 * w1**2 + (l / 2) * c2 * w2**2, l * s1 * w1**2 + (l / 2) * s2 * w2**2], 0)
            f1 = mi * np.stack([np.zeros(n), -G - aP], 0) + mi * rho1     # m(g_vec - P'' + rho), g_vec = (0, -G)
            f2 = mi * np.stack([np.zeros(n), -G - aP], 0) + mi * rho2
            J1 = np.stack([-(l / 2) * s1, (l / 2) * c1], 0)               # d c1 / d th1
            J2a = np.stack([-l * s1, l * c1], 0)                          # d c2 / d th1
            J2b = np.stack([-(l / 2) * s2, (l / 2) * c2], 0)              # d c2 / d th2
            JRa = np.stack([-l * s1, l * c1], 0)
            JRb = np.stack([-l * s2, l * c2], 0)
            FR = np.stack([Fx, Fz], 0)
            sp = -kf * (th2 - th1) - cf * (1.0 if scored else 25.0) * (w2 - w1)
            b1 = (J1 * f1).sum(0) + (J2a * f2).sum(0) + (JRa * FR).sum(0) - sp
            b2 = (J2b * f2).sum(0) + (JRb * FR).sum(0) + sp
            det = M11 * M22 - M12 * M12
            a1 = (M22 * b1 - M12 * b2) / det
            a2 = (-M12 * b1 + M11 * b2) / det
            # person's vertical force on the sheet: sum m_i a_i,z - m g_vec... = sum m_i (a_i - g_vec) - F_R
            az1 = aP + J1[1] * a1 - rho1[1]
            az2 = aP + J2a[1] * a1 + J2b[1] * a2 - rho2[1]
            FPz = mi * (az1 + G) + mi * (az2 + G) - Fz
            w1 = w1 + a1 * dt; w2 = w2 + a2 * dt
            th1 = th1 + w1 * dt; th2 = th2 + w2 * dt
            tilt = np.arctan2(Rz - zP, Rx)
            Iz = Iz + (zref - Rz) * dt
        if scored:
            peak_tilt = np.maximum(peak_tilt, np.abs(tilt))
            peak_p = np.maximum(peak_p, FPz / G)
    ok = np.isfinite(peak_tilt) & (peak_tilt < np.radians(30))
    return {"peak_tilt_deg": np.degrees(peak_tilt), "end_tilt_deg": np.degrees(np.abs(tilt)),
            "person_kg_peak": peak_p, "ok": ok}


def success(res, tilt_peak_deg=3.0, tilt_end_deg=0.5):
    """An episode passes if the sheet stays within tilt_peak_deg, ends within tilt_end_deg, and the person's peak load stays under NIOSH."""
    with np.errstate(invalid="ignore"):
        return res["ok"] & (res["peak_tilt_deg"] <= tilt_peak_deg) & (res["end_tilt_deg"] <= tilt_end_deg) \
            & (res["person_kg_peak"] <= NIOSH_KG)

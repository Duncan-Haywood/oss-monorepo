"""codesign-cant milestone 7c: linear stability of one horizontal axis of `poshold.rollout`, feed-forward included.

`poshold.rollout` integrates the vehicle with explicit Euler steps of A.DT. Around hover (zero tilt, rate, torque and yaw, no
saturation, no noise) every step is linear, and the two horizontal axes decouple at zero yaw. Gust and wind enter additively and
do not change stability, so the closed loop of one axis is x_{t+1} = M x_t with the 11 states

    p, w, pint            position, velocity, position integrator (world, along the axis)
    th, th_prev           tilt about the axis and last step's tilt (the controller reads the one-step-old angle)
    om, om_prev           body rate and last step's rate (likewise)
    integ                 attitude integrator
    tq                    delivered torque (first-order motor lag, randomised lag and torque scale)
    tq_hat, f_ff          milestone 7's lagged torque estimate and low-passed side-force feed-forward (ff_mode="cmd")

For the pitch axis the translation is a = g th + lam tq / m with lam = lat; for the roll axis, written in y' = -y, it is the same
form with lam = -lat. So one canted vehicle has one axis where the side force adds to the tilt's push (lam > 0) and one where it
opposes it (lam < 0); both must be stable. `step` copies the order of operations in `poshold.rollout` line by line, and `matrix`
builds M from it by stepping unit vectors (tests/test_linstab.py checks the result against `rollout` itself).
"""
import numpy as np

from . import aero as A
from . import poshold as P

NX = 11
PLANT_CORNERS = [(t, m, l) for t in A.PLANT_RANGES["wide"]["tau"] for m in A.PLANT_RANGES["wide"]["mass"] for l in A.PLANT_RANGES["wide"]["lag"]]


def step(x, d):
    """One `rollout` step of the linearised axis. x (..., 11); d holds broadcastable arrays: kp, kd, ki (attitude, share of
    tau_max per rad), kpp, kdp, kip (position), lam (side force per torque, signed), tmax (nominal torque limit), I (actual
    inertia), m (actual mass), m_nom, lag (actual), lag_nom, tau_s (torque scale), ff (gain), mode ("cmd" or "integ"), b_ff."""
    p, w, pint, th, thp, om, omp, integ, tq, tqh, fff = (x[..., k] for k in range(NX))
    ep, ev = -p, w
    pint = pint + ep * A.DT
    acc = d["kpp"] * ep - d["kdp"] * ev + d["kip"] * pint
    if d["mode"] == "integ":
        fff = d["lam"] * d["ki"] * integ * d["tmax"]
        tqh = 0.0 * tqh                            # unused in this mode; held, it would add a spurious eigenvalue of exactly 1
    ab = acc - d["ff"] * fff / d["m_nom"]
    ref = ab / A.G
    e = ref - thp
    integ = integ + e * A.DT
    u = d["kp"] * e - d["kd"] * omp + d["ki"] * integ
    mixed = u * d["tmax"]
    if d["mode"] == "cmd":
        tqh = tqh + (mixed - tqh) * (A.DT / d["lag_nom"])
        fff = fff + (d["lam"] * tqh - fff) * d["b_ff"]
    tq = tq + (mixed * d["tau_s"] - tq) * (A.DT / d["lag"])
    omp, thp = om, th
    om = om + tq / d["I"] * A.DT
    a = A.G * th + d["lam"] * tq / d["m"]          # tilt before this step's update, torque after (as in rollout)
    th = th + om * A.DT
    w = w + a * A.DT
    p = p + w * A.DT
    return np.stack([p, w, pint, th, thp, om, omp, integ, tq, tqh, fff], -1)


def matrix(d, shape):
    """Closed-loop matrices (*shape, 11, 11) for parameter arrays broadcastable to `shape`."""
    M = np.zeros(tuple(shape) + (NX, NX))
    for k in range(NX):
        e = np.zeros(tuple(shape) + (NX,)); e[..., k] = 1.0
        M[..., :, k] = step(e, d)
    return M


def design_params(x, alpha_max=np.deg2rad(80.0), kappa_per_d=0.081, tau_ff=None, ki_scale=1.0, twr=None):
    """Unit-cube designs (N,12 or 13) -> the nominal quantities `step` needs, as in `poshold.score` (twr as there, milestone 7h)."""
    x = np.atleast_2d(np.asarray(x, float))
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0])
    D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L, D, alpha_max * np.clip(x[:, 2], 0, 1), kappa_per_d=kappa_per_d, twr=twr, actuator="hover")
    g = P.phys_gains(x[:, 3:12])
    if tau_ff is None:
        tau_ff = P.TAU_FF_RANGE[0] * (P.TAU_FF_RANGE[1] / P.TAU_FF_RANGE[0]) ** np.clip(x[:, 12], 0, 1) if x.shape[1] == 13 else P.TAU_FF
    tau_ff = np.broadcast_to(np.asarray(tau_ff, float), (x.shape[0],))
    return dict(kp=g[:, 0], kd=g[:, 1], ki=g[:, 2] * ki_scale, kpp=g[:, 6], kdp=g[:, 7], kip=g[:, 8],
                lat=P.lateral_per_torque(sz["alpha"], sz["L"], kappa_per_d * D), tmax=sz["tau_max"], I0=sz["inertia"],
                m_nom=sz["mass"], lag_nom=sz["lag"], b_ff=A.DT / np.maximum(tau_ff, A.DT), alpha=sz["alpha"])


def radius(dp, tau_s, mass_s, lag_s, ff=1.0, mode="integ", axis_sign=1.0):
    """Spectral radius per design (rows of dp) and plant (tau_s, mass_s, lag_s: arrays of shape (K,)), shape (N, K).
    axis_sign +1 is the pitch-like axis (lam = +lat), -1 the roll-like axis (lam = -lat)."""
    c = lambda v: np.asarray(v, float)[:, None]
    r = lambda v: np.asarray(v, float)[None, :]
    d = dict(kp=c(dp["kp"]), kd=c(dp["kd"]), ki=c(dp["ki"]), kpp=c(dp["kpp"]), kdp=c(dp["kdp"]), kip=c(dp["kip"]),
             lam=axis_sign * c(dp["lat"]), tmax=c(dp["tmax"]), I=c(dp["I0"]) * r(mass_s), m=c(dp["m_nom"]) * r(mass_s),
             m_nom=c(dp["m_nom"]), lag=c(dp["lag_nom"]) * r(lag_s), lag_nom=c(dp["lag_nom"]), tau_s=r(tau_s), ff=ff, mode=mode,
             b_ff=c(dp["b_ff"]))
    shape = (len(dp["kp"]), len(np.atleast_1d(tau_s)))
    return np.abs(np.linalg.eigvals(matrix(d, shape))).max(-1)


def growth_rate(rho):
    """Continuous-time growth rate (1/s) of the slowest-decaying mode, ln(rho) / DT: > 0 grows, e-fold time 1 / rate."""
    return np.log(rho) / A.DT


def worst_radius(dp, ff=1.0, mode="integ", plants=None):
    """Largest spectral radius over both axes and the plant set (default: the eight corners of the `wide` randomisation)."""
    t, m, l = (np.array(v) for v in zip(*(plants or PLANT_CORNERS)))
    return np.maximum(radius(dp, t, m, l, ff, mode, 1.0), radius(dp, t, m, l, ff, mode, -1.0)).max(1)


def ki_ceiling(dp, ff=1.0, mode="integ", plants=None, hi=4.0, iters=40):
    """Per design, the largest multiple s of its attitude ki for which every plant corner and both axes stay stable (bisection on
    s in [0, hi]; returns 0 if the design is unstable even at ki = 1e-3 x its own (at exactly ki = 0 the unused attitude integrator
    is a held state with eigenvalue 1, so the lower bracket is checked just above it), hi if still stable at hi). Times kp gives the ki/kp ceiling."""
    N = len(dp["kp"]); lo_s, hi_s = np.zeros(N), np.full(N, hi)
    base = dp["ki"].copy()
    def ok(s):
        q = dict(dp); q["ki"] = base * s
        return worst_radius(q, ff, mode, plants) < 1.0
    st0, sth = ok(np.full(N, 1e-3)), ok(hi_s)
    for _ in range(iters):
        mid = 0.5 * (lo_s + hi_s)
        good = ok(mid)
        lo_s, hi_s = np.where(good, mid, lo_s), np.where(good, hi_s, mid)
    return np.where(~st0, 0.0, np.where(sth, hi, lo_s))

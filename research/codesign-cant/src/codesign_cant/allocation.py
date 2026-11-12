"""Full four-rotor allocation for an X quadrotor whose rotors are canted about their arm axes.

Milestone 1 of the `codesign-cant` programme. The seven earlier `codesign-aero-cant*` projects gave the attitude
simulator per-axis torque limits from two hand-written formulas,

    tau_roll_max = 4 (Tmax - Th) (L / sqrt 2) cos(alpha)
    tau_yaw_max  = 2 (Tmax - Th) (kappa cos(alpha) + (L / sqrt 2) sin(alpha))

with L the arm length (centre to rotor), Th the per-rotor hover thrust and kappa the reaction torque per newton.
This module derives the torque a real mixer can deliver from the full 6x4 map from rotor thrusts to body wrench,
with every thrust held inside [0, Tmax], and checks the closed forms against a linear programme.

Geometry (body frame, z up): rotor i sits at L (cos psi_i, sin psi_i, 0) with psi = 45, 135, 225, 315 deg and spin
sign s = (+1, -1, +1, -1); the reaction torque on the body is s_i kappa T_i n_i. Each thrust axis is tilted by alpha
about its own arm axis, toward the side that makes the tangential force's yaw moment add to the reaction torque:
n_i = cos(alpha) z + s_i sin(alpha) t_i with t_i = (-sin psi_i, cos psi_i, 0). Then, per rotor,

    yaw   = s_i T_i (L sin(alpha) + kappa cos(alpha))
    roll  = T_i sin(psi_i) (L cos(alpha) - kappa sin(alpha))     (the tilted reaction torque takes a little away)
    pitch = -T_i cos(psi_i) (L cos(alpha) - kappa sin(alpha))
    Fz    = T_i cos(alpha),   F_horizontal = s_i T_i sin(alpha) t_i

`layout(..., sense=-1)` tilts the other way (tangential moment opposes the reaction torque) for the sign check.
"""
import numpy as np

PSI = np.deg2rad([45.0, 135.0, 225.0, 315.0])
SPIN = np.array([1.0, -1.0, 1.0, -1.0])


def layout(alpha, L, kappa, sense=1.0):
    """(6, 4) map from rotor thrusts to body wrench (Fx, Fy, Fz, tau_x, tau_y, tau_z), built from vectors, not from the closed forms."""
    out = np.zeros((6, 4))
    for i, (psi, s) in enumerate(zip(PSI, SPIN)):
        p = L * np.array([np.cos(psi), np.sin(psi), 0.0])
        t = np.array([-np.sin(psi), np.cos(psi), 0.0])
        n = np.cos(alpha) * np.array([0.0, 0.0, 1.0]) + sense * s * np.sin(alpha) * t
        out[:3, i] = n
        out[3:, i] = np.cross(p, n) + s * kappa * n
    return out


def lp_max_torque(alpha, L, kappa, Th, Tmax, axis, mode="hover", sense=1.0):
    """Largest pure torque about `axis` (0 roll, 1 pitch, 2 yaw) with every thrust in [0, Tmax], the other two torques zero
    and no net horizontal force.  mode="hover": total vertical force held at hover (4 Th cos(alpha), Th already includes the
    1/cos(alpha) of a canted rotor).  mode="free": collective free (an attitude-priority mixer, "airmode")."""
    from scipy.optimize import linprog
    B = layout(alpha, L, kappa, sense)
    rows, rhs = [], []
    for k in range(3):
        if k != axis:
            rows.append(B[3 + k]); rhs.append(0.0)
    if mode == "hover":
        rows.append(B[2]); rhs.append(4 * Th * np.cos(alpha))
    res = linprog(-B[3 + axis], A_eq=np.array(rows), b_eq=np.array(rhs), bounds=[(0.0, Tmax)] * 4, method="highs")
    if not res.success:
        return np.nan, None
    T = res.x
    return float(B[3 + axis] @ T), B[:2] @ T     # torque and the horizontal force that comes with it


def delta(Th, Tmax, mode="hover"):
    """Per-rotor thrust swing available around the operating point: min(Th, Tmax - Th) at hover, Tmax / 2 with free collective."""
    return np.minimum(Th, Tmax - Th) if mode == "hover" else 0.5 * np.asarray(Tmax, float)


def closed_form(alpha, L, kappa, Th, Tmax, mode="hover"):
    """(roll_max, yaw_max, lateral force per unit roll torque) from the derivation in the module docstring."""
    d = delta(Th, Tmax, mode)
    ca, sa = np.cos(alpha), np.sin(alpha)
    roll = 4 * d * (L * ca - kappa * sa) / np.sqrt(2)
    yaw = 4 * d * (L * sa + kappa * ca)
    lateral = sa / (L * ca - kappa * sa)          # |F_horizontal| / |tau_roll| for a pure roll command
    return roll, yaw, lateral


def prior_model(alpha, L, kappa, Th, Tmax):
    """The formulas the codesign-aero-cant* projects used (roll, yaw, lateral force per torque in -poshold)."""
    r = L / np.sqrt(2)
    roll = 4 * (Tmax - Th) * r * np.cos(alpha)
    yaw = 2 * (Tmax - Th) * (kappa * np.cos(alpha) + r * np.sin(alpha))
    lateral = np.tan(alpha) / r
    return roll, yaw, lateral


def hover_power_ratio(alpha):
    """Ideal (momentum-theory) hover power of a canted vehicle relative to an uncanted one of the same weight and disc area:
    each rotor carries T / cos(alpha) and induced power goes as T^1.5."""
    return np.cos(alpha) ** -1.5


# ---- Milestone 2: combined commands share one polytope -------------------------------------------------------------
# The rows of the wrench map for roll, pitch, yaw and Fz are orthogonal sign patterns (a 4x4 Hadamard matrix), so the
# thrust change that delivers a torque request is explicit:
#     dT = tau_r sqrt2 / (4 kr) [1, 1, -1, -1] + tau_p sqrt2 / (4 kr) [-1, 1, 1, -1] + tau_y / (4 ky) [1, -1, 1, -1]
# with kr = L cos(alpha) - kappa sin(alpha), ky = L sin(alpha) + kappa cos(alpha), and Fz unchanged.
ROLL_PAT = np.array([1.0, 1.0, -1.0, -1.0])
PITCH_PAT = np.array([-1.0, 1.0, 1.0, -1.0])
YAW_PAT = SPIN


def arms(alpha, L, kappa):
    """(kr, ky): roll/pitch and yaw torque per newton of one rotor's thrust, from the rows of `layout`."""
    return L * np.cos(alpha) - kappa * np.sin(alpha), L * np.sin(alpha) + kappa * np.cos(alpha)


def thrust_change(tau, kr, ky):
    """tau (..., 3) torque request -> (..., 4) change in rotor thrusts with no change in Fz. kr, ky broadcast against tau[..., 0]."""
    kr, ky = np.asarray(kr, float)[..., None], np.asarray(ky, float)[..., None]
    return (tau[..., 0:1] * ROLL_PAT + tau[..., 1:2] * PITCH_PAT) * (np.sqrt(2) / (4 * kr)) + tau[..., 2:3] * YAW_PAT / (4 * ky)


def _largest_scale(base, step, lo, hi):
    """Largest s in [0, 1] with lo <= base + s * step <= hi elementwise over the last axis (base assumed feasible)."""
    with np.errstate(divide="ignore", invalid="ignore"):
        up = np.where(step > 1e-15, (hi - base) / step, np.inf)
        dn = np.where(step < -1e-15, (lo - base) / step, np.inf)
    return np.clip(np.minimum(up, dn).min(axis=-1), 0.0, 1.0)


def _largest_scale_spread(base, step, Tmax):
    """Largest s in [0, 1] with max_i - min_i of (base + s step) <= Tmax (collective free: any common shift is allowed)."""
    db = base[..., :, None] - base[..., None, :]
    ds = step[..., :, None] - step[..., None, :]
    with np.errstate(divide="ignore", invalid="ignore"):
        s = np.where(ds > 1e-15, (Tmax[..., None, None] - db) / ds, np.inf)
    return np.clip(s.reshape(s.shape[:-2] + (-1,)).min(axis=-1), 0.0, 1.0)


def mix_priority(tau, kr, ky, Th, Tmax, mode="hover"):
    """Attitude-priority mixer (roll and pitch first, scaled together to keep their direction; yaw gets what is left,
    as in the PX4 and Betaflight mixers). Returns the delivered torque (..., 3) and the two scales (s_rp, s_yaw).
    mode="hover": every thrust in [0, Tmax] with the collective at hover. mode="free": the collective may shift ("airmode"),
    so only the spread of the four thrusts is bounded by Tmax."""
    kr, ky, Th, Tmax = (np.broadcast_to(np.asarray(v, float), tau.shape[:-1]) for v in (kr, ky, Th, Tmax))
    rp = tau.copy(); rp[..., 2] = 0.0
    yw = np.zeros_like(tau); yw[..., 2] = tau[..., 2]
    a, b = thrust_change(rp, kr, ky), thrust_change(yw, kr, ky)
    zero = np.zeros_like(a)
    if mode == "hover":
        lo, hi = -Th[..., None], (Tmax - Th)[..., None]
        s_rp = _largest_scale(zero, a, lo, hi)
        s_y = _largest_scale(s_rp[..., None] * a, b, lo, hi)
    else:
        s_rp = _largest_scale_spread(zero, a, Tmax)
        s_y = _largest_scale_spread(s_rp[..., None] * a, b, Tmax)
    out = np.empty_like(tau)
    out[..., :2] = tau[..., :2] * s_rp[..., None]
    out[..., 2] = tau[..., 2] * s_y
    return out, s_rp, s_y

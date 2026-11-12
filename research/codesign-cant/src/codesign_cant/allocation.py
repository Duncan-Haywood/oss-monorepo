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

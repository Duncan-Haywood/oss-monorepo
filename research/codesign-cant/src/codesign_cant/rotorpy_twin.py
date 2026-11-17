"""codesign-cant milestone 5: the co-designed vehicles in RotorPy (Folk et al. 2023, MIT) with canted rotors.

RotorPy's `Multirotor` assumes every thrust axis is the body z axis. `CantedMultirotor` keeps its state, integrator (scipy
`solve_ivp`), first-order motor-speed dynamics, quaternion kinematics and aerodynamic model, and replaces only the wrench:
rotor i (position p_i, spin s_i, axis n_i from `allocation.layout`) makes

    thrust      T_i = k_eta w_i^2 + k_h |v_i,perp|^2                      along n_i
    rotor drag  H_i = -w_i (k_d v_i,perp + k_z (v_i . n_i) n_i)           (RotorPy's diag(k_d, k_d, k_z), in the rotor's own frame)
    reaction    s_i k_m w_i^2 n_i                                         (the reaction torque turns with the canted axis)
    frame drag  D = -|v| C_D v at a centre of pressure (0, 0, h_cp) above the centre of mass

with v_i the local airspeed at hub i (body airspeed + omega x p_i), v_i,perp its part normal to n_i. At alpha = 0 this is RotorPy's
own `compute_body_wrench` (tests/test_rotorpy_twin.py checks it to 1e-12) plus the centre-of-pressure lever.

Parameters come from `aero.size` (mass, inertia, arm, propeller diameter, hover and maximum thrust, motor lag, frame area) and,
for the aerodynamic coefficients RotorPy needs and the stylised simulator lacks, from RotorPy's AscTec Hummingbird file scaled to the
design's propeller by momentum-theory exponents: k_eta (C_T = 0.1145 from the Hummingbird's 5.57e-6 at D = 0.2 m) and k_h with D^4
and D^2, k_d and k_z with D^3. Those scalings are assumptions (no rotor-drag data for these propellers); the experiment sweeps them.

The controller is the stylised simulator's (`aero.rollout`), re-implemented for one vehicle: the same PID, INDI and geometric laws
and gains, the same one-step-old noisy measurements, the same attitude-priority mixer (`allocation.mix_priority`) and nominal
model; it adds an altitude loop the stylised model did not need (it held altitude perfectly).
"""
import numpy as np
from scipy.spatial.transform import Rotation

from rotorpy.vehicles.multirotor import Multirotor

from . import aero as A
from .allocation import PSI, SPIN, layout, mix_priority, thrust_change

# RotorPy's AscTec Hummingbird (rotorpy/vehicles/hummingbird_params.py, v3.0.0): the reference rotor for the scalings below.
HB_D, HB_K_ETA, HB_K_D, HB_K_Z, HB_K_H, HB_C_DX = 0.20, 5.57e-06, 1.19e-04, 2.32e-04, 3.39e-3, 0.5e-2
CT_HB = HB_K_ETA * 4 * np.pi ** 2 / (A.RHO * HB_D ** 4)       # 0.1145: thrust coefficient implied by k_eta = C_T rho D^4 / (4 pi^2)
CD_FRAME = 1.0                                                # drag coefficient on aero.size's area, as the stylised gust torque uses
KZ, KDZ = 4.0, 4.0                                            # altitude loop (1/s^2, 1/s): critically damped at 2 rad/s (ASSUMED)


class CantedMultirotor(Multirotor):
    """RotorPy Multirotor whose rotor i thrusts along n_i (canted about its own arm) and whose frame drag acts at (0, 0, h_cp).
    `ext_moment` (body frame, N m) is added to the wrench: the stylised simulator's gust torque in the `torque` condition."""

    def __init__(self, quad_params, axes, h_cp=0.0, **kw):
        self.axes = np.asarray(axes, float)          # (4, 3) unit thrust axes, body frame
        self.h_cp = h_cp
        self.ext_moment = np.zeros(3)
        super().__init__(quad_params, **kw)

    def compute_body_wrench(self, body_rates, rotor_speeds, body_airspeed_vector):
        p, n = self.rotor_geometry, self.axes                               # (4, 3)
        v = body_airspeed_vector[None, :] + np.cross(body_rates[None, :], p)   # local airspeed at each hub
        vn = (v * n).sum(1)
        vperp = v - vn[:, None] * n
        T = self.k_eta * rotor_speeds ** 2
        if self.aero:
            T = T + self.k_h * (vperp ** 2).sum(1)
            H = -rotor_speeds[:, None] * (self.k_d * vperp + self.k_z * vn[:, None] * n)
            D = -np.linalg.norm(body_airspeed_vector) * (self.drag_matrix @ body_airspeed_vector)
        else:
            H = np.zeros((4, 3)); D = np.zeros(3)
        Frot = T[:, None] * n + H
        M = np.cross(p, Frot).sum(0) + ((self.rotor_dir * self.k_m * rotor_speeds ** 2)[:, None] * n).sum(0)
        M = M + np.cross(np.array([0.0, 0.0, self.h_cp]), D) + self.ext_moment
        return Frot.sum(0) + D, M


def design_params(sz, i, kappa, iz_ratio=A.IZ_RATIO, aero_scale=1.0):
    """RotorPy parameter dict for design i of an `aero.size` result (nominal plant)."""
    L, D, alpha = float(sz["L"][i]), float(sz["D"][i]), float(sz["alpha"][i])
    k_eta = CT_HB * A.RHO * D ** 4 / (4 * np.pi ** 2)
    I0 = float(sz["inertia"][i])
    s = aero_scale
    return dict(
        mass=float(sz["mass"][i]), Ixx=I0, Iyy=I0, Izz=I0 * iz_ratio, Ixy=0.0, Iyz=0.0, Ixz=0.0,
        num_rotors=4, rotor_radius=D / 2,
        rotor_pos={f"r{j + 1}": L * np.array([np.cos(PSI[j]), np.sin(PSI[j]), 0.0]) for j in range(4)},
        rotor_directions=SPIN.copy(), rI=np.zeros(3),
        c_Dx=0.5 * A.RHO * CD_FRAME * float(sz["area"][i]), c_Dy=0.5 * A.RHO * CD_FRAME * float(sz["area"][i]),
        c_Dz=2 * 0.5 * A.RHO * CD_FRAME * float(sz["area"][i]),   # RotorPy's Hummingbird has c_Dz = 2 c_Dx
        k_eta=k_eta, k_m=kappa * k_eta,
        k_d=s * HB_K_D * (D / HB_D) ** 3, k_z=s * HB_K_Z * (D / HB_D) ** 3, k_h=s * HB_K_H * (D / HB_D) ** 2, k_flap=0.0,
        tau_m=float(sz["lag"][i]), rotor_speed_min=0.0, rotor_speed_max=float(np.sqrt(sz["Tmax"][i] / k_eta)), motor_noise_std=0.0,
        alpha=alpha, L=L, kappa=kappa)


def euler_zyx(q):
    """RotorPy quaternion [x, y, z, w] to the stylised simulator's (roll, pitch, yaw)."""
    yaw, pitch, roll = Rotation.from_quat(q).as_euler("ZYX")
    return np.array([roll, pitch, yaw])


def episode(prm, sz_i, gains, ctrl, ep, refs, plant, mode="aero", h_cp=0.0, rk="RK45"):
    """One 2 s attitude episode of the stylised task in RotorPy. Returns per-axis sum of squared error (rad^2) over STEPS and
    whether the vehicle stayed within 60 deg of level. mode: "torque" (RotorPy rigid body and motors, aero off, the stylised gust
    torque kg v|v| injected on roll and pitch) or "aero" (RotorPy aero on: rotor drag, inflow, translational lift and frame drag at
    the centre of pressure, driven by the stylised wind state as a world-frame wind (v_x, v_y, 0); no injected torque)."""
    ref, gust_n, gyro_n, ang_n, u0 = (r[ep] for r in refs)
    tau_f, mass_f, lag_f = plant["tau"][ep], plant["mass"][ep], plant["lag"][ep]
    alpha, L, kappa = prm["alpha"], prm["L"], prm["kappa"]
    B = layout(alpha, L, kappa)
    q = dict(prm)
    for k in ("alpha", "L", "kappa"):
        q.pop(k)
    q["Ixx"] *= mass_f; q["Iyy"] *= mass_f; q["Izz"] *= mass_f       # aero.rollout's "mass" draw scales the inertia only
    q["k_eta"] *= tau_f; q["k_m"] *= tau_f                         # torque effectiveness; max thrust falls with it, as tmax does
    q["tau_m"] *= lag_f
    m, g = prm["mass"], A.G
    Th, Tmax = float(sz_i["T_hover"]), float(sz_i["Tmax"])
    w_h = np.sqrt(Th / (prm["k_eta"] * tau_f))
    x0 = dict(x=np.zeros(3), v=np.zeros(3), q=np.array([0.0, 0.0, 0.0, 1.0]), w=np.zeros(3), wind=np.zeros(3), rotor_speeds=np.full(4, w_h))
    veh = CantedMultirotor(q, B[:3].T.copy(), h_cp=h_cp, initial_state=x0, control_abstraction="cmd_motor_speeds",
                           aero=(mode == "aero"), integrator_kwargs={"method": rk})
    Inom = np.array([prm["Ixx"], prm["Iyy"], prm["Izz"]])
    tmax_nom = np.array([sz_i["tau_max"], sz_i["tau_max"], sz_i["tau_yaw"]], float)
    kr, ky = float(sz_i["kr"]), float(sz_i["ky"])
    kg = 0.5 * A.RHO * float(sz_i["area"]) * float(sz_i["lever"])
    k_eta_nom = prm["k_eta"]
    a = np.exp(-A.DT / 0.5)
    v = 3.0 + 4.0 * u0                       # aero.rollout defaults: gust_mean 3, gust_std 4
    if ctrl == "pid":
        kp = np.array([gains[0], gains[0], gains[3]]); kd = np.array([gains[1], gains[1], gains[4]]); ki = np.array([gains[2], gains[2], gains[5]])
    elif ctrl == "geo":
        gR = np.array([gains[0], gains[0], gains[3]]); gW = np.array([gains[1], gains[1], gains[4]]); gI = np.array([gains[2], gains[2], gains[5]])
        integ_R = np.zeros(3)
    else:
        ka_ = np.array([gains[0], gains[0], gains[2]]); kr_ = np.array([gains[1], gains[1], gains[3]])
        af = 1 - np.exp(-2 * np.pi * gains[4] * A.DT); geff = gains[5]
        w1 = np.zeros(3); w2 = np.zeros(3); w2_prev = np.zeros(3); q1 = np.zeros(3); q2 = np.zeros(3); tq_hat = np.zeros(3)
    integ = np.zeros(3)
    state = {k: np.array(val, float) for k, val in x0.items()}
    prev = {k: val.copy() for k, val in state.items()}
    sse = np.zeros(3); alive = True
    for t in range(A.STEPS):
        v = a * v + (1 - a) * 3.0 + 4.0 * np.sqrt(1 - a * a) * gust_n[:, t]
        th_m = euler_zyx(prev["q"]) + ang_n[:, t]
        e = ref[:, t] - th_m
        integ = np.clip(integ + e * A.DT, -0.3, 0.3)
        gy = prev["w"] + gyro_n[:, t]
        if ctrl == "pid":
            u = kp * e - kd * gy + ki * integ
        elif ctrl == "geo":
            eR = A.so3_error(th_m[None], ref[:, t][None])[0]
            integ_R = np.clip(integ_R + eR * A.DT, -0.3, 0.3)
            u = (Inom * (-gR * eR - gW * gy - gI * integ_R) + np.cross(gy, Inom * gy)) / tmax_nom
        else:
            w1 += (gy - w1) * af; w2 += (w1 - w2) * af
            wdot = (w2 - w2_prev) / A.DT; w2_prev = w2.copy()
            q1 += (tq_hat - q1) * af; q2 += (q1 - q2) * af
            u = (q2 + Inom * geff * (kr_ * (ka_ * e - gy) - wdot)) / tmax_nom
        req = np.clip(u, -1, 1) * tmax_nom
        mixed = mix_priority(req[None], kr, ky, Th, Tmax, mode="hover")[0][0]
        if ctrl == "indi":
            tq_hat = np.clip(tq_hat + (mixed - tq_hat) * (A.DT / prm["tau_m"]), -tmax_nom, tmax_nom)
        # collective: altitude hold on the (one-step-old) state, tilt-compensated; the mixer's thrust change rides on it
        R = Rotation.from_quat(prev["q"]).as_matrix()
        fz = m * (g - KZ * prev["x"][2] - KDZ * prev["v"][2]) / max(R[2, 2], 0.5)
        T_cmd = np.clip(Th * fz / (m * g) + thrust_change(mixed[None], kr, ky)[0], 0.0, Tmax)
        cmd = {"cmd_motor_speeds": np.sqrt(T_cmd / k_eta_nom)}
        if mode == "torque":
            veh.ext_moment = np.array([kg * v[0] * abs(v[0]), kg * v[1] * abs(v[1]), 0.0])
        else:
            state["wind"] = np.array([v[0], v[1], 0.0])
        prev = {k: val.copy() for k, val in state.items()}
        state = veh.step(state, cmd, A.DT)
        th = euler_zyx(state["q"])
        err = ref[:, t] - th if alive else np.full(3, np.deg2rad(60.0))
        if alive and (abs(th[0]) >= np.deg2rad(60.0) or abs(th[1]) >= np.deg2rad(60.0) or not np.all(np.isfinite(th))):
            alive = False
        sse += err ** 2
    return sse, alive

"""MuJoCo grasp-lift-shake rollout for a parametric two-finger parallel gripper.

World: a table at z = 0; a free object resting on it; a hand that moves in z and y (slide joints with
position actuators); two fingers on x-slides, each pushed inwards by a constant force `F` newtons.
Each finger pad is two thin boxes rotated about z by +-theta, so the pad faces form a shallow V that
centres round objects (theta = 0 is a flat pad). Gravity on. Success = the object is still held,
within `HOLD_MM` of where it sat relative to the hand when the fingers had closed, after the lift
and a lateral shake. Interface lengths are millimetres; MuJoCo gets metres.
"""
import math
import mujoco
import numpy as np

OPEN_HALF = 0.050                    # fingers start 50 mm either side of the hand centre line
FINGER_DENSITY = 1240.0 * 0.5        # kg/m^3: PLA with an assumed 50% effective fill
Z0 = 0.002                           # finger bottom edge above the table at the start
LIFT = 0.080                         # m
T_CLOSE, T_LIFT, T_HOLD, T_SHAKE = 0.55, 0.40, 0.15, 0.60
SHAKE_AMP, SHAKE_HZ = 0.020, 3.0     # peak lateral acceleration about 7 m/s^2
HOLD_MM = 12.0
CLOSE_SPEED = 0.10                   # m/s, each finger, until it meets the object; then the force limit F holds
DT = 0.002
CARRIAGE_KG = 0.030                  # slider carriage + servo horn per finger, assumed
KV = 8.0                             # N s/m of the approach servo (kept low: explicit control at 2 ms against ~20 g fingers)


def object_geom(kind, size):
    """(geom attributes, half height m, volume m^3). size in mm: radius (cyl, sphere) or side (box); cyl and box are 60 mm tall."""
    s = size * 1e-3
    if kind == "cyl":
        h = 0.060
        return "type='cylinder' size='%.5f %.5f'" % (s, h / 2), h / 2, math.pi * s * s * h
    if kind == "sphere":
        return "type='sphere' size='%.5f'" % s, s, 4 / 3 * math.pi * s ** 3
    h = 0.060
    return "type='box' size='%.5f %.5f %.5f'" % (s / 2, s / 2, h / 2), h / 2, s * s * h


def _finger(sgn, w, t, L, theta, mu):
    half = w / 4.0
    yc, xc = half * math.cos(theta), -sgn * half * math.sin(theta)
    pads = ""
    for k in (-1, 1):
        pads += ("<geom type='box' pos='%.5f %.5f 0' euler='0 0 %.5f' size='%.5f %.5f %.5f' "
                 "friction='%.3f 0.005 0.0001' density='%.1f' solref='0.004 1'/>"
                 % (xc, k * yc, math.degrees(sgn * k * theta), t / 2, half, L / 2, mu, FINGER_DENSITY))
    n = "p" if sgn > 0 else "n"
    return ("<body name='f%s' pos='%.5f 0 0'><joint name='jf%s' type='slide' axis='%d 0 0' damping='1'/>"
            "<geom type='sphere' size='0.004' mass='%.3f' contype='0' conaffinity='0'/>%s</body>"
            % (n, sgn * OPEN_HALF, n, -sgn, CARRIAGE_KG, pads))


def build_xml(design, obj, force):
    """design: dict(w, t, L, v, mu) with mm; obj: dict(kind, size, mass_g, mu_obj, dy_mm, dz_mm)."""
    w, t, L = design["w"] * 1e-3, design["t"] * 1e-3, design["L"] * 1e-3
    theta = math.radians(35.0 * design["v"])
    geom, hh, vol = object_geom(obj["kind"], obj["size"])
    dens = obj["mass_g"] * 1e-3 / vol
    hand_z = Z0 + L / 2 + obj["dz_mm"] * 1e-3
    return ("<mujoco><option timestep='%g' gravity='0 0 -9.81' cone='elliptic' impratio='5'/>"
            "<worldbody><geom type='plane' size='1 1 0.1' friction='0.8 0.005 0.0001'/>"
            "<body name='obj' pos='0 0 %.5f'><freejoint/><geom %s density='%.2f' friction='%.3f 0.005 0.0001' solref='0.004 1'/></body>"
            "<body name='hand' pos='0 %.5f %.5f'><joint name='hz' type='slide' axis='0 0 1' damping='50'/>"
            "<joint name='hy' type='slide' axis='0 1 0' damping='50'/>"
            "<geom type='sphere' size='0.005' mass='0.3' contype='0' conaffinity='0'/>%s%s</body>"
            "</worldbody><actuator>"
            "<general joint='jfp' gainprm='1' ctrlrange='-1000 1000'/><general joint='jfn' gainprm='1' ctrlrange='-1000 1000'/>"
            "<position joint='hz' kp='4000' ctrlrange='-1 1'/><position joint='hy' kp='4000' ctrlrange='-1 1'/>"
            "</actuator></mujoco>"
            % (DT, hh, geom, dens, obj["mu_obj"], obj["dy_mm"] * 1e-3, hand_z,
               _finger(1, w, t, L, theta, design["mu"]), _finger(-1, w, t, L, theta, design["mu"])))


def _smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def rollout(design, obj, force):
    """Run one grasp-lift-shake. Returns dict(success, slip_mm)."""
    m = mujoco.MjModel.from_xml_string(build_xml(design, obj, force))
    d = mujoco.MjData(m)
    bo, bh = m.body("obj").id, m.body("hand").id
    t_end = T_CLOSE + T_LIFT + T_HOLD + T_SHAKE
    jp, jn = m.joint('jfp').dofadr[0], m.joint('jfn').dofadr[0]
    rel0, slip, gripping = None, 0.0, False
    for i in range(int(round(t_end / DT))):
        t = i * DT
        # approach at ~CLOSE_SPEED with a soft velocity servo, then (sticky) grip with the full force F
        if not gripping and t > 0.05 and max(abs(d.qvel[jp]), abs(d.qvel[jn])) < 0.02:
            gripping = True
        d.ctrl[0] = force if gripping else min(force, KV * (CLOSE_SPEED - d.qvel[jp]))
        d.ctrl[1] = force if gripping else min(force, KV * (CLOSE_SPEED - d.qvel[jn]))
        d.ctrl[2] = LIFT * _smooth((t - T_CLOSE) / T_LIFT)
        ts = t - (T_CLOSE + T_LIFT + T_HOLD)
        d.ctrl[3] = SHAKE_AMP * math.sin(2 * math.pi * SHAKE_HZ * ts) if ts > 0 else 0.0
        mujoco.mj_step(m, d)
        if rel0 is None and t >= T_CLOSE:
            rel0 = d.xpos[bo] - d.xpos[bh]
        if rel0 is not None:
            slip = max(slip, float(np.linalg.norm((d.xpos[bo] - d.xpos[bh]) - rel0)) * 1e3)
        if not np.isfinite(d.qpos).all():
            return {"success": False, "slip_mm": float("inf")}
    end = float(np.linalg.norm((d.xpos[bo] - d.xpos[bh]) - rel0)) * 1e3
    lifted = d.xpos[bo][2] > 0.5 * LIFT
    return {"success": bool(lifted and end < HOLD_MM), "slip_mm": slip}

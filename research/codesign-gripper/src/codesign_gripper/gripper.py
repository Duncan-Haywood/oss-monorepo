"""A parametric two-finger gripper scored in MuJoCo.

Design x = (L, t, w, a): finger length L (mm), plate thickness t (mm), pad width w (mm) and V-notch
half-angle a (degrees). Each finger is a V of two printed plates (flat pad when a = 0). The controller
is scripted: close at constant speed, ramp the grip force up to F, lift 80 mm, shake. For each design the
force F is picked from a grid of fractions of the strongest force the design allows (servo limit and the
finger's bending-stress limit); that per-design choice is the whole "policy". No reinforcement learning.
"""
import math
import numpy as np
import mujoco

LB = np.array([15.0, 1.5, 8.0, 0.0])
UB = np.array([60.0, 8.0, 40.0, 50.0])
NAMES = ("L_mm", "t_mm", "w_mm", "a_deg")

SERVO_FMAX = 8.0          # N, per finger (stall force of a hobby-class servo drive)
SIGMA_MAX = 20e6          # Pa, allowable bending stress in a printed finger (FDM layer lines, with margin)
DENSITY = 1240.0          # kg/m3 PLA
FLOW_MM3_S = 10.0         # effective print rate including travel, mm3/s
MAX_OPENING = 0.060       # m between the two V apexes when open
FRACTIONS = (0.25, 0.5, 0.75, 1.0)
PLASTIC_WEIGHT = 0.01     # objective penalty per gram of plastic
PAD_MU = 0.5
OFFSET_SCALE = 1.0       # multiplies each object's x offset (the stress test in experiments/robust.py widens it)

# name, shape, size (m: cylinder r,h/2; box half x,y,z; sphere r), mass kg, centre offset in x (m)
OBJECTS = (
    ("small cylinder", "cylinder", (0.010, 0.020), 0.040, 0.003),
    ("large cylinder", "cylinder", (0.020, 0.020), 0.120, -0.003),
    ("cube", "box", (0.015, 0.015, 0.015), 0.060, 0.004),
    ("wide block", "box", (0.010, 0.025, 0.020), 0.080, -0.004),
    ("sphere", "sphere", (0.015,), 0.050, 0.002),
    ("thin plate", "box", (0.020, 0.002, 0.015), 0.020, 0.0),
    ("heavy cylinder", "cylinder", (0.015, 0.020), 0.200, 0.0),
    ("small cube", "box", (0.006, 0.006, 0.006), 0.010, -0.002),
)

DT = 0.002
T_CLOSE, T_RAMP, T_LIFT, T_SHAKE = 0.9, 0.3, 0.5, 0.8
LIFT = 0.08
CLEARANCE = 0.004         # m, palm is held this far above the table so the fingers do not drag on it
SHAKE_A, SHAKE_HZ = 0.010, 6.0


def clip(x):
    return np.minimum(np.maximum(np.asarray(x, float), LB), UB)


def plastic_g(x):
    L, t, w, a = x
    return 2 * (L * t * w) * 1e-9 * DENSITY * 1e3


def print_min(x):
    L, t, w, a = x
    return 2 * L * t * w / FLOW_MM3_S / 60.0


def force_cap(x):
    """Strongest grip force (N) the design allows: servo limit, or tip-loaded bending stress at SIGMA_MAX."""
    L, t, w, a = x
    f_stress = SIGMA_MAX * (w * 1e-3) * (t * 1e-3) ** 2 / (6 * L * 1e-3)
    return min(SERVO_FMAX, f_stress), f_stress < SERVO_FMAX


def _plate(side, j, w, t, a, L):
    """Geom xml for plate j (-1/+1) of the finger on side (+1: y>0). Apex of the V at the finger origin."""
    ar = math.radians(a)
    h = w / 4.0
    ux, uy = j * math.cos(ar), -side * math.sin(ar)       # unit vector along the plate, toward the object
    nx, ny = -j * math.sin(ar), -side * math.cos(ar)      # plate normal, toward the object
    cx, cy = h * ux - (t / 2) * nx, h * uy - (t / 2) * ny
    phi = math.degrees(math.atan2(uy, ux))
    return (f'<geom type="box" size="{h:.6f} {t / 2:.6f} {L / 2:.6f}" pos="{cx:.6f} {cy:.6f} {L / 2 + 0.0005:.6f}" '
            f'euler="0 0 {phi:.4f}" friction="{PAD_MU} 0.005 0.0001" rgba="0.2 0.5 0.9 1"/>')


def build_xml(x, obj):
    L, t, w, a = (x[0] * 1e-3, x[1] * 1e-3, x[2] * 1e-3, x[3])
    name, shape, size, mass, ox = obj
    if shape == "cylinder":
        g = f'type="cylinder" size="{size[0]} {size[1]}"'; zc = size[1]
    elif shape == "box":
        g = f'type="box" size="{size[0]} {size[1]} {size[2]}"'; zc = size[2]
    else:
        g = f'type="sphere" size="{size[0]}"'; zc = size[0]
    fingers = ""
    for side in (1, -1):
        plates = "".join(_plate(side, j, w, t, a, L) for j in (-1, 1))
        rng = "-0.045 0.005" if side == 1 else "-0.005 0.045"
        fingers += (f'<body name="f{side}" pos="0 {side * MAX_OPENING / 2} 0">'
                    f'<joint name="j{side}" type="slide" axis="0 1 0" range="{rng}" damping="5"/>'
                    f'<inertial pos="0 0 {L / 2}" mass="0.004" diaginertia="1e-6 1e-6 1e-6"/>{plates}</body>')
    return f"""<mujoco>
<option timestep="{DT}" cone="elliptic" impratio="10" gravity="0 0 -9.81"/>
<default><geom solref="0.01 1" solimp="0.95 0.99 0.001"/></default>
<worldbody>
 <geom name="table" type="plane" size="1 1 0.1" friction="0.8 0.005 0.0001"/>
 <body name="palm" pos="0 0 0"><joint name="jz" type="slide" axis="0 0 1" damping="20"/><inertial pos="0 0 0.05" mass="0.3" diaginertia="1e-4 1e-4 1e-4"/>{fingers}</body>
 <body name="obj" pos="{ox * OFFSET_SCALE} 0 {zc + 0.0005}"><freejoint/>
  <geom {g} mass="{mass}" friction="{PAD_MU} 0.005 0.0001" rgba="0.9 0.5 0.1 1"/></body>
</worldbody>
<actuator><motor name="a1" joint="j1" gear="1" ctrllimited="false"/><motor name="a-1" joint="j-1" gear="1"/><position name="az" joint="jz" kp="4000" kv="80"/></actuator>
</mujoco>"""


def _min_jerk(s):
    return 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5


def simulate(x, obj, force):
    """One grasp. Returns dict: ok, dropped, slip_mm (object lag behind the palm at the end), and why it failed."""
    name, shape, size, mass, ox = obj
    half_width = size[1] if shape == "box" else size[0]
    if 2 * half_width > MAX_OPENING * 0.98:
        return {"ok": False, "why": "object wider than the 60 mm opening", "slip_mm": float("nan")}
    m = mujoco.MjModel.from_xml_string(build_xml(x, obj))
    d = mujoco.MjData(m)
    oid = m.body("obj").id
    qadr = m.jnt_qposadr[m.joint("j1").id], m.jnt_qposadr[m.joint("j-1").id]
    vadr = m.jnt_dofadr[m.joint("j1").id], m.jnt_dofadr[m.joint("j-1").id]
    for _ in range(int(0.15 / DT)):
        mujoco.mj_step(m, d)
    z0 = d.xpos[oid][2]
    n = int((T_CLOSE + T_RAMP + T_LIFT + T_SHAKE) / DT)
    t1, t2, t3 = T_CLOSE, T_CLOSE + T_RAMP, T_CLOSE + T_RAMP + T_LIFT
    maxslip = 0.0
    for i in range(n):
        t = i * DT
        if t < t1:
            d.ctrl[0] = -0.2; d.ctrl[1] = 0.2
        else:
            F = force * min(1.0, (t - t1) / T_RAMP)
            d.ctrl[0] = -F; d.ctrl[1] = F
        pz = 0.0
        if t >= t2:
            pz = LIFT * _min_jerk(min(1.0, (t - t2) / T_LIFT))
        if abs(t - t1) < DT / 2:
            gap_mm = (MAX_OPENING + d.qpos[qadr[0]] - d.qpos[qadr[1]]) * 1e3
        if t >= t3:
            pz += SHAKE_A * math.sin(2 * math.pi * SHAKE_HZ * (t - t3))
        d.ctrl[2] = CLEARANCE + pz
        mujoco.mj_step(m, d)
    rise = d.xpos[oid][2] - z0
    slip = (pz - rise) * 1e3
    held = rise > 0.9 * LIFT and abs(d.xpos[oid][1]) < 0.05 and slip < 12.0
    why = "" if held else ("dropped on lift" if rise < 0.3 * LIFT else "slipped out during lift or shake")
    return {"ok": bool(held), "why": why, "slip_mm": float(slip), "gap_mm": float(gap_mm)}


def evaluate(x):
    """Score a design. Success rate over the 8 objects at the best force fraction, minus plastic cost."""
    x = clip(x)
    cap, stress_bound = force_cap(x)
    best = None
    for fr in FRACTIONS:
        F = cap * fr
        res = [simulate(x, o, F) for o in OBJECTS]
        s = sum(r["ok"] for r in res) / len(OBJECTS)
        if best is None or s > best[0] + 1e-9:
            best = (s, fr, F, res)
        if s >= 1.0 - 1e-9:
            break
    s, fr, F, res = best
    g = plastic_g(x)
    return {
        "x": [float(v) for v in x], "success": float(s), "force_N": F, "force_fraction": fr,
        "force_cap_N": cap, "stress_limited": bool(stress_bound), "plastic_g": float(g), "print_min": print_min(x),
        "J": float(s - PLASTIC_WEIGHT * g),
        "per_object": {o[0]: {"ok": r["ok"], "why": r["why"], "slip_mm": r["slip_mm"], "gap_mm": r.get("gap_mm")} for o, r in zip(OBJECTS, res)},
    }

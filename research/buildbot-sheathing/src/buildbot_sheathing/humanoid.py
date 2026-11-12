"""Milestone 3, second part: can a stock Unitree G1 or H1 work a sheet that sits on the ledger?

Part one (``ledger.py``) found that a ledger squares a sheet if the holder lets it roll and presses
under about 100 N. Here the holder is a humanoid (MuJoCo Menagerie models, through
``buildbot_payload``'s static whole-body model and ``buildbot_fasten``'s lean for a push), with
three jobs and one property:

* ``carry``: hold the whole sheet at the hang with no ledger (the job a ledger removes).
* ``press``: press the seated sheet into the wall with F_n (N).
* ``slide``: press, and push the seated sheet sideways along the ledger to its stud line, which
  takes P = mu_l m g + mu_w F_n (``slide_force``).
* ``rotational_stiffness``: the stiffness the sheet feels about the wall normal when the robot
  holds a joint-space PD pose with gains kp per joint, through both arms' Jacobians with the feet
  planted. Part one's closed form says a holder stiffer than (m g W/2 - mu F_n r_bar) / theta0
  keeps part of its error theta0.

Sliding a seated sheet by pushing at height h above its bottom edge, with the press at the same
height and the wall contacts at the four corners, lifts the trailing corner once

    h > h* = (m g W/2 + mu_w F_n h_press) / (mu_l m g + mu_w F_n),

which is W / (2 mu_l) when h_press = h (``tip_height``; the wall friction's moment cancels).
``slide_sim`` checks it in MuJoCo with part one's sheet, wall and ledger.

Axes as in ``ledger.py``: x out of the wall, y along it, z up. For the robot (``buildbot_payload``)
x is forward, so the wall is at +x in its frame and the reaction on its hands is -F_n along x.
Static only: no walking, no policy, no grip model beyond rigid or point contact.
"""
import math
import os
import sys

import numpy as np

from . import ledger as L

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
for _p in ("buildbot-payload", "buildbot-fasten"):
    _s = os.path.join(_ROOT, _p, "src")
    if _s not in sys.path:
        sys.path.append(_s)

G = L.G
W, H, MASS = L.W, L.H, L.MASS

# Joint PD gains (N m / rad). G1 arms and waist: unitree_sdk2 example/g1/high_level/
# g1_arm7_sdk_dds_example.cpp (kp = 60, kd = 1.5). G1 legs: unitree_rl_gym
# deploy/deploy_mujoco/configs/g1.yaml (hips 100, knee 150, ankles 40). H1: unitree_rl_gym
# legged_gym/envs/h1/h1_config.py (hips 150, knee 200, ankle 40, torso 300, shoulder 150, elbow 100).
# Both read on 2026-11-12 from the repositories' main branches.
GAINS = {
    "g1": [("hip", 100.0), ("knee", 150.0), ("ankle", 40.0), ("waist", 60.0), ("shoulder", 60.0),
           ("elbow", 60.0), ("wrist", 60.0)],
    "h1": [("hip", 150.0), ("knee", 200.0), ("ankle", 40.0), ("torso", 300.0), ("shoulder", 150.0),
           ("elbow", 100.0)],
}


# ---------------------------------------------------------------- closed forms
def slide_force(mu_l, mu_w, f_n, m=MASS):
    """Sideways force (N) that slides a seated sheet along the ledger while pressed with f_n."""
    return mu_l * m * G + mu_w * f_n


def tip_height(mu_l, mu_w=0.4, f_n=0.0, h_press=None, m=MASS):
    """Push height above the bottom edge (m) above which the trailing corner lifts.

    Moments about the leading bottom corner: gravity m g W/2 restores; the push P at h tips; the
    wall friction mu_w F_n acts at the centroid of the wall normal forces, which is the press
    height h_press for a rigid sheet on its four corners. h_press = None means h_press = h."""
    if h_press is None:
        return W / (2 * mu_l)
    return (m * G * W / 2 + mu_w * f_n * h_press) / slide_force(mu_l, mu_w, f_n, m)


# ---------------------------------------------------------------- MuJoCo slide
def _slide_xml(mu_l, mu_w, timestep):
    r = 0.002
    hw, hh, ht = W / 2, H / 2, L.T / 2
    wall = "\n".join(
        f'<geom type="sphere" size="{r}" pos="{-ht + r:.6f} {y:.6f} {z:.6f}" friction="{mu_w} 0.005 0.0001" '
        f'contype="2" conaffinity="0" rgba="0 0 0 0"/>' for y, z in L.wall_points("corners"))
    foot = "\n".join(
        f'<geom type="sphere" size="{r}" pos="0 {y:.6f} {-hh + r:.6f}" friction="{mu_l} 0.005 0.0001" '
        f'contype="4" conaffinity="0" rgba="0 0 0 0"/>' for y in (-hw + r, hw - r))
    return f"""
<mujoco>
  <compiler angle="radian"/>
  <option timestep="{timestep}" gravity="0 0 -{G}" cone="elliptic" impratio="10" noslip_iterations="20"/>
  <default><geom solref="0.002 1" solimp="0.95 0.99 0.001"/></default>
  <worldbody>
    <geom name="wall" type="box" size="0.05 4 3" pos="-0.05 0 1.5" friction="0 0 0" contype="0" conaffinity="2"/>
    <geom name="ledger" type="box" size="0.02 4 0.02" pos="0.02 0 {L.LEDGER_Z - 0.02}" friction="0 0 0"
          contype="0" conaffinity="4"/>
    <body name="sheet" pos="{ht + 1e-4} 0 {L.LEDGER_Z + hh + 1e-4}">
      <freejoint/>
      <geom type="box" size="{ht} {hw} {hh}" mass="{MASS}" contype="0" conaffinity="0"/>
      {wall}
      {foot}
    </body>
  </worldbody>
</mujoco>"""


def slide_sim(h, mu_l=0.4, mu_w=0.4, f_n=50.0, h_press=None, v=0.05, k=2.0e4, t_push=2.0,
              settle=0.5, timestep=5e-4):
    """Push a seated sheet sideways (+y) with a hand that moves at speed v through a spring k,
    at height h above the sheet's bottom edge, while pressing f_n at height h_press (default h).

    Returns the peak tilt magnitude (rad), the distance slid (m) and the mean push force after
    the first 0.5 s of pushing (N)."""
    import mujoco

    h_press = h if h_press is None else h_press
    m = mujoco.MjModel.from_xml_string(_slide_xml(mu_l, mu_w, timestep))
    d = mujoco.MjData(m)
    bid = m.body("sheet").id
    flat_k, flat_b = 500.0, 50.0
    hand, y_start, forces, peak = None, None, [], 0.0
    t_end = settle + t_push
    while d.time < t_end:
        R = d.xmat[bid].reshape(3, 3)
        com = d.xpos[bid]
        vel = np.zeros(6)
        mujoco.mj_objectVelocity(m, d, mujoco.mjtObj.mjOBJ_BODY, bid, vel, 0)
        w_, lin = vel[:3], vel[3:]
        p_push = com + R @ np.array([L.T / 2, 0.0, h - H / 2])
        p_press = com + R @ np.array([L.T / 2, 0.0, h_press - H / 2])
        f_press = np.array([-f_n, 0.0, 0.0])
        f_push = np.zeros(3)
        if d.time >= settle:
            if hand is None:
                hand, y_start = float(p_push[1]), float(com[1])
            hand += v * timestep
            pt_vel = lin + np.cross(w_, p_push - com)
            fy = max(0.0, k * (hand - p_push[1]) - 2 * math.sqrt(k * MASS) * (pt_vel[1] - v))
            f_push = np.array([0.0, fy, 0.0])
            if d.time > settle + 0.5:
                forces.append(fy)
        torque = np.cross(p_push - com, f_push) + np.cross(p_press - com, f_press)
        torque += [0.0, -flat_k * math.atan2(R[0, 2], R[2, 2]) - flat_b * w_[1],
                   flat_k * math.atan2(R[0, 1], R[1, 1]) - flat_b * w_[2]]
        d.xfrc_applied[bid] = [*(f_push + f_press), *torque]
        mujoco.mj_step(m, d)
        if d.time >= settle:
            peak = max(peak, abs(L.theta_of(d.xmat[bid].reshape(3, 3))))
    return {"peak_tilt": peak, "slid": float(d.xpos[bid][1] - (y_start or 0.0)),
            "push_mean": float(np.mean(forces)) if forces else 0.0}


def tip_threshold_sim(mu_l, mu_w=0.4, f_n=50.0, h_press=None, tilt=math.radians(0.5), tol=0.01):
    """Least push height (m above the bottom edge) at which the slide tilts the sheet past `tilt`."""
    lo, hi = 0.05, H - 0.05
    if slide_sim(hi, mu_l, mu_w, f_n, h_press)["peak_tilt"] < tilt:
        return None
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if slide_sim(mid, mu_l, mu_w, f_n, h_press)["peak_tilt"] >= tilt:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


# ---------------------------------------------------------------- whole body
def robot(name):
    from buildbot_payload import model as P
    r = P.load(name)
    return r, P.standing(r)


def hold(rob, d0, hand_xz, ext, carry_kg=0.0, mu_foot=0.6, q_init=None):
    """Static whole-body check for a force `ext` (N, robot frame, on the robot's hands, split
    equally) on top of `carry_kg` held in the hands. Leans the CoM by -ext_x z / weight
    (buildbot-fasten). Returns (ok, why, qpos, worst ratio)."""
    import mujoco
    from buildbot_payload import model as P
    from buildbot_fasten import model as F

    m = rob.model
    weight = (float(m.body_subtreemass[1]) + carry_kg) * G
    z = hand_xz[1]
    dx = -ext[0] * z / weight
    p = P.pose(rob, d0, hand_xz, carry_kg, "palm", q_init, com_dx=dx)
    full = np.asarray(ext, float) + [0.0, 0.0, -carry_kg * G]
    tau, ratio, f = F.ground_wrench(rob, p.qpos, full, "palm")
    fz = f[2] + f[8]
    fxy = math.hypot(f[0] + f[6], f[1] + f[7])
    slip_ok = fz > 0 and fxy <= mu_foot * fz
    lift_ok = min(f[2], f[8]) > 0
    k = int(np.argmax(ratio))
    jid = int(np.flatnonzero(m.jnt_dofadr == k)[0])
    joint = mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, jid)
    ok = p.ok and float(ratio.max()) <= 1.0 and lift_ok and slip_ok
    why = ("reach" if not p.ok else "slip" if not slip_ok else "foot lifts" if not lift_ok
           else joint if ratio.max() > 1.0 else "ok")
    return ok, why, p.qpos, float(ratio.max())


def max_press(rob, d0, hand_xz, mu_l=None, mu_w=0.4, carry_kg=0.0, mu_foot=0.6, hi=400.0, tol=1.0):
    """Largest press F_n (N) at hand_xz; with mu_l set, while also applying the slide force.
    Returns (F_n or None, limiting reason)."""
    def ext(fn):
        lat = 0.0 if mu_l is None else slide_force(mu_l, mu_w, fn)
        return [-fn, -lat, 0.0]
    ok, why, q, _ = hold(rob, d0, hand_xz, ext(0.0), carry_kg, mu_foot)
    if not ok:
        return None, why
    lo = 0.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        ok2, w2, q2, _ = hold(rob, d0, hand_xz, ext(mid), carry_kg, mu_foot, q)
        if ok2:
            lo, q = mid, q2
        else:
            hi, why = mid, w2
    return lo, why


def gains(rob, scale=1.0, released=()):
    """kp per dof (base dofs = 0) from GAINS by joint-name keyword; `released` keywords get 0."""
    import mujoco
    m = rob.model
    kp = np.zeros(m.nv)
    for j in range(m.njnt):
        if m.jnt_type[j] != mujoco.mjtJoint.mjJNT_HINGE:
            continue
        name = mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, j)
        val = None
        for key, g in GAINS[rob.name]:
            if key in name:
                val = g
                break
        if val is None:
            raise KeyError(name)
        if any(r in name for r in released):
            val = 0.0
        kp[m.jnt_dofadr[j]] = val * scale
    return kp


def hand_jacobian(rob, qpos, grip="rigid"):
    """Jacobian of both hands' motion with respect to the actuated joints, feet planted.

    The base moves so that both soles keep their pose (least squares through the foot Jacobian),
    as in buildbot-fasten's tip_jacobian. Rows: for each hand (left, right) the point velocity
    (3) and, for a rigid grasp, the angular velocity (3). Returns (J, hand points)."""
    import mujoco
    from buildbot_payload import model as P
    m = rob.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    Jf = np.vstack([np.vstack(P._jac(m, d, P._bid(m, b), p)) for b, p in rob.feet])
    base = -np.linalg.pinv(Jf[:, :6]) @ Jf[:, 6:]
    rows, pts = [], []
    for b, p in rob.hands["palm"]:
        jp, jr = P._jac(m, d, P._bid(m, b), p)
        pts.append(P._point(d, P._bid(m, b), p))
        rows.append(jp)
        if grip == "rigid":
            rows.append(jr)
    Jh = np.vstack(rows)
    return Jh[:, 6:] + Jh[:, :6] @ base, pts


def sheet_twist(pts, pivot, grip="rigid"):
    """Hand motion per radian of sheet rotation about the wall normal (robot -x axis) through
    `pivot`: each hand point moves by omega x (p - pivot) and, rigidly held, turns by omega."""
    omega = np.array([-1.0, 0.0, 0.0])        # +theta about the wall's +x, which is the robot's -x
    t = []
    for p in pts:
        t.append(np.cross(omega, p - pivot))
        if grip == "rigid":
            t.append(omega)
    return np.concatenate(t)


def rotational_stiffness(rob, qpos, kp, pivot, grip="rigid", free_translation=False):
    """Sheet stiffness about the wall normal (N m / rad) for joint stiffness kp (per dof).

    Compliance of the hands C = J K^-1 J^T (released joints get a compliance of 1e6 rad / N m);
    stiffness for a prescribed hand motion t is t^T C^-1 t. With free_translation the sheet may
    also translate in the wall plane (y, z) to whatever minimises the stiffness (a Schur
    complement): the lower bound when nothing holds the pivot."""
    J, pts = hand_jacobian(rob, qpos, grip)
    k = kp[6:]
    comp = np.where(k > 0, 1.0 / np.maximum(k, 1e-12), 1e6)
    C = (J * comp) @ J.T
    Kh = np.linalg.inv(C + 1e-12 * np.eye(len(C)))
    t = sheet_twist(pts, pivot, grip)
    if not free_translation:
        return float(t @ Kh @ t)
    cols = [t]
    for axis in (np.array([0.0, 1.0, 0.0]), np.array([0.0, 0.0, 1.0])):
        tr = []
        for _ in pts:
            tr.append(axis)
            if grip == "rigid":
                tr.append(np.zeros(3))
        cols.append(np.concatenate(tr))
    T = np.array(cols).T
    Ks = T.T @ Kh @ T
    return float(Ks[0, 0] - Ks[0, 1:] @ np.linalg.solve(Ks[1:, 1:], Ks[1:, 0]))


def limit_stiffness(theta0, mu=0.4, f_n=50.0, layout="corners"):
    """Part one's limit: a holder stiffer than this (N m / rad) keeps part of theta0."""
    return (L.GRAVITY_MOMENT - mu * f_n * L.r_bar(layout)) / theta0

"""Milestone 3, first part: does a ledger board square a sheet a robot hangs, and what is left?

A rigid 4x8 sheet of 7/16 in OSB is pressed against a wall by a holder that pushes at its centre
and lowered onto a level ledger board (MuJoCo). The holder is an in-plane impedance on the
sheet's (y, z, theta) aimed at the pose it believes plumb, which is off by ``theta0``. When a
bottom corner touches the ledger the holder ramps its vertical support and translation gains to
zero over ``t_release`` seconds. Its rotational stiffness about ``theta0`` is either released too
(``k_hold=None``) or kept at ``k_hold`` (a stiff wrist that keeps holding). The tilt left once the
sheet settles is the hang error a ledger leaves before the panel's own geometry is added.

Axes: x out of the wall, y along the wall, z up. theta is the sheet's rotation about +x, so the
bottom edge's slope is theta. Wall contacts are explicit points on the sheet's back face (the four
corners, or points along the stud lines), so the friction moment can be predicted in closed form:
with the press shared equally by n points at distances r_i from the landing corner,

    friction moment = mu F_n mean(r_i),  gravity moment about the corner = m g W / 2,

and a held wrist of stiffness k leaves  max(0, theta0 - (m g W/2 - mu F_n r_bar) / k).

The panel's own geometry (``panel_tilt``): PS 2-18 section 5.2.1.3 requires panels square within
1/64 in per foot of the longest edge measured along the diagonals, and every edge within 1/16 in
of the corner-to-corner line. A bottom edge bowed outward by s rests on its middle and one
corner, tilted 2 s / W; bowed inward it rests on both corners.

Units are SI (metres, newtons, radians) unless a name says otherwise.
"""
import math

import numpy as np

IN = 0.0254
FT = 12 * IN
G = 9.81
W = 48 * IN                     # sheet width, along the wall
H = 96 * IN                     # sheet height
T = 7 / 16 * IN                 # 7/16 in OSB
MASS = 21.8                     # kg, buildbot-payload (1.5 lb/ft^2 retail listing)
LEDGER_Z = 0.5                  # height of the ledger top (any value; nothing depends on it)
GRAVITY_MOMENT = MASS * G * W / 2

# PS 2-18, section 5.2.1.3 (opened 2026-11-12)
SQUARE_DIAG = (1 / 64) * (H / FT) * IN          # diagonal difference allowed, 1/8 in on 8 ft
STRAIGHT = 1 / 16 * IN                           # edge to corner-to-corner line
# Pro cross-line laser rating, 1/8 in at 30 ft (maker listings, seen in search 2026-11-12)
LASER_SLOPE = (1 / 8 * IN) / (30 * FT)


def corner_angle_limit(diag=SQUARE_DIAG, w=W, h=H):
    """Corner angle error (rad) of a w x h parallelogram whose diagonals differ by `diag`.

    For a small shear delta, d1 - d2 = 2 w h sin(delta) / d, d the diagonal."""
    d = math.hypot(w, h)
    return math.asin(diag * d / (2 * w * h))


def wall_points(layout="corners", n_rows=5):
    """(y, z) of the wall contact points on the sheet's back face, about the sheet centre."""
    if layout == "corners":
        ys, zs = [-W / 2, W / 2], [-H / 2, H / 2]
    elif layout == "studs":                      # 16 in o.c.: studs under both edges, two field
        ys = [-W / 2, -W / 6, W / 6, W / 2]
        zs = list(np.linspace(-H / 2, H / 2, n_rows))
    else:
        raise ValueError(layout)
    return [(y, z) for y in ys for z in zs]


def r_bar(layout="corners", corner=(-W / 2, -H / 2)):
    pts = wall_points(layout)
    return float(np.mean([math.hypot(y - corner[0], z - corner[1]) for y, z in pts]))


def press_threshold(mu, layout="corners"):
    """Least press F_n (N) at which wall friction holds the gravity moment about the corner."""
    return GRAVITY_MOMENT / (mu * r_bar(layout))


def held_residual(theta0, k, mu, f_n, layout="corners"):
    """Closed-form tilt a held wrist of stiffness k leaves (rad); theta0 > 0."""
    if k is None or k <= 0:
        return 0.0 if mu * f_n * r_bar(layout) < GRAVITY_MOMENT else theta0
    free = GRAVITY_MOMENT - mu * f_n * r_bar(layout)
    if free <= 0:
        return theta0
    return max(0.0, theta0 - free / k)


def _xml(mu, layout, sag, ledger_dz, timestep, solref, edge=None):
    r = 0.002
    hw, hh, ht = W / 2, H / 2, T / 2
    wall = "\n".join(
        f'<geom type="sphere" size="{r}" pos="{-ht + r:.6f} {y:.6f} {z:.6f}" '
        f'contype="2" conaffinity="0" rgba="0 0 0 0"/>' for y, z in wall_points(layout))
    feet = [(-hw + r, -hh + r), (hw - r, -hh + r)]
    if sag:
        feet.append((0.0, -hh + r - sag))
    if edge is not None:                  # milestone 6b: feet on a given bottom-edge profile
        feet = [(y, -hh + r + dz) for y, dz in edge]
    foot = "\n".join(
        f'<geom type="sphere" size="{r}" pos="0 {y:.6f} {z:.6f}" contype="4" conaffinity="0" '
        f'rgba="0 0 0 0"/>' for y, z in feet)
    # ledger: tilt it by giving it a small rotation about x (ledger_dz = height difference over W)
    lt = math.atan2(ledger_dz, W)
    return f"""
<mujoco>
  <compiler angle="radian"/>
  <option timestep="{timestep}" gravity="0 0 -{G}" cone="elliptic" impratio="10" noslip_iterations="20"/>
  <default><geom friction="{mu} 0.005 0.0001" solref="{solref} 1" solimp="0.95 0.99 0.001"/></default>
  <worldbody>
    <geom name="wall" type="box" size="0.05 3 3" pos="-0.05 0 1.5" contype="0" conaffinity="2"/>
    <body name="ledger" pos="0.02 0 {LEDGER_Z - 0.02}" euler="{lt} 0 0">
      <geom name="ledger" type="box" size="0.02 1.5 0.02" contype="0" conaffinity="4"/>
    </body>
    <body name="sheet" pos="{ht + 1e-4} 0 1.8">
      <freejoint/>
      <geom type="box" size="{ht} {hw} {hh}" mass="{MASS}" contype="0" conaffinity="0"/>
      {wall}
      {foot}
    </body>
  </worldbody>
</mujoco>"""


def theta_of(R):
    """Sheet rotation about +x from its 3x3 rotation matrix."""
    return math.atan2(-R[1, 2], R[2, 2])


def seat(theta0=math.radians(1.0), mu=0.4, f_n=50.0, k_hold=None, layout="corners", sag=0.0,
         ledger_dz=0.0, v=0.02, t_release=0.5, settle=2.0, k_theta=3000.0, timestep=5e-4,
         solref=0.002, gap=0.010, return_trace=False, edge=None):
    """Lower one sheet onto the ledger. Returns a dict with the final tilt (rad) relative to the
    ledger, the creep rate after settling (rad/s), the time of first contact and the run time.

    theta0     the holder's error about plumb (its target angle)
    f_n        press against the wall (N), applied at the sheet centre
    k_hold     None: the rotational stiffness is released with the support; a number: the wrist
               keeps that stiffness (N m / rad) about theta0 while the sheet settles
    sag        outward bow of the bottom edge (m), modelled as a third foot at mid-width
    ledger_dz  height difference of the ledger over the sheet width (m)
    edge       None, or (y, dz) of each foot on the bottom edge (dz < 0 below the nominal edge);
               replaces the corner feet and ``sag`` (milestone 6b, ``bowed_edge.profile``)
    """
    import mujoco

    m = mujoco.MjModel.from_xml_string(_xml(mu, layout, sag, ledger_dz, timestep, solref, edge))
    d = mujoco.MjData(m)
    bid = m.body("sheet").id
    lid = m.geom("ledger").id
    # set the initial pose: rotation theta0 about x, lowest foot `gap` above the ledger
    q = np.zeros(4)
    mujoco.mju_axisAngle2Quat(q, np.array([1.0, 0, 0]), theta0)
    d.qpos[3:7] = q
    mujoco.mj_forward(m, d)
    feet = [g for g in range(m.ngeom) if m.geom_bodyid[g] == bid and m.geom_contype[g] == 4]
    low = min(d.geom_xpos[g][2] - m.geom_size[g][0] for g in feet)
    d.qpos[2] += (LEDGER_Z + gap) - low
    mujoco.mj_forward(m, d)
    y0, z_ref = float(d.xpos[bid][1]), float(d.xpos[bid][2])
    kt, bt = 20000.0, 2 * math.sqrt(20000.0 * MASS)
    inertia = MASS * (W ** 2 + H ** 2) / 12
    bth = 2 * math.sqrt(k_theta * inertia)
    k_flat, b_flat = 500.0, 50.0
    t_contact, trace = None, []
    t_end = 30.0
    while d.time < t_end:
        R = d.xmat[bid].reshape(3, 3)
        th = theta_of(R)
        vel = np.zeros(6)
        mujoco.mj_objectVelocity(m, d, mujoco.mjtObj.mjOBJ_BODY, bid, vel, 0)   # world frame
        w_, lin = vel[:3], vel[3:]
        if t_contact is None:
            for i in range(d.ncon):
                c = d.contact[i]
                if lid in (c.geom1, c.geom2):
                    t_contact = d.time
                    t_end = t_contact + t_release + settle
                    break
        if t_contact is None:
            r = 1.0
            z_ref -= v * timestep
        else:
            r = max(0.0, 1.0 - (d.time - t_contact) / t_release)
        p = d.xpos[bid]
        fy = r * (kt * (y0 - p[1]) - bt * lin[1])
        fz = r * (MASS * G + kt * (z_ref - p[2]) - bt * lin[2])
        if k_hold is None:
            tx = r * (k_theta * (theta0 - th) - bth * w_[0])
        else:
            bh = 2 * math.sqrt(max(k_hold, 1.0) * inertia)
            kk = k_theta + (k_hold - k_theta) * (1 - r)
            bb = bth + (bh - bth) * (1 - r)
            tx = kk * (theta0 - th) - bb * w_[0]
        # keep the sheet flat to the wall (its out-of-plane rotations), press it on
        ty = -k_flat * math.atan2(R[0, 2], R[2, 2]) - b_flat * w_[1]
        tz = k_flat * math.atan2(R[0, 1], R[1, 1]) - b_flat * w_[2]
        d.xfrc_applied[bid] = [-f_n, fy, fz, tx, ty, tz]
        mujoco.mj_step(m, d)
        if return_trace and int(round(d.time / timestep)) % 20 == 0:
            trace.append((d.time, th))
    th_end = theta_of(d.xmat[bid].reshape(3, 3)) - math.atan2(ledger_dz, W)
    vel = np.zeros(6)
    mujoco.mj_objectVelocity(m, d, mujoco.mjtObj.mjOBJ_BODY, bid, vel, 0)
    out = {"theta": th_end, "creep": float(vel[0]), "t_contact": t_contact, "t": d.time}
    if return_trace:
        out["trace"] = trace
    return out


def panel_tilt(rng, n, square_frac=1.0, straight_frac=1.0):
    """Tilt of the vertical edges of a panel seated on a perfect ledger (rad), PS 2 geometry.

    The corner angle error is uniform within +/- square_frac x the PS 2 limit; the bottom edge's
    bow is uniform within +/- straight_frac x 1/16 in, and an outward bow rocks the panel onto
    its middle and a random corner (tilt +/- 2 s / W). Both shapes are assumptions: the standard
    gives limits, not distributions."""
    a = rng.uniform(-1, 1, n) * square_frac * corner_angle_limit()
    s = rng.uniform(-1, 1, n) * straight_frac * STRAIGHT
    rock = np.where(s > 0, 2 * s / W, 0.0) * rng.choice([-1.0, 1.0], n)
    return a + rock


def ledger_tilt(rng, n, s_corner=0.5e-3, laser=LASER_SLOPE):
    """Slope of the ledger under one sheet (rad): the laser line's error, uniform within its
    rating, plus a Gaussian height error s_corner at each of the sheet's two bottom corners."""
    lz = rng.uniform(-1, 1, n) * laser
    dz = rng.normal(0, s_corner, (n, 2)) if s_corner > 0 else np.zeros((n, 2))
    return lz + (dz[:, 1] - dz[:, 0]) / W

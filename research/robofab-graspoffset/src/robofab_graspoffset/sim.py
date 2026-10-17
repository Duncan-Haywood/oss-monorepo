"""MuJoCo test: does a pinched cube with an off-centre centre of mass stay put under gravity?"""
import mujoco
import numpy as np

from .model import mass_kg

T_SETTLE = 0.1
T_HOLD = 0.25
BALL_R = 0.004  # m, ball-pad radius


def mjcf(side_mm, d_mm, mu, mu_t, pad, solref=0.0005):
    h = side_mm * 1e-3 / 2
    m = mass_kg(side_mm)
    inertia = m * (2 * h) ** 2 / 6
    cond = 4 if pad == "ball" else 3
    out = ['<mujoco><option timestep="0.0002" gravity="0 0 -9.81" cone="elliptic" noslip_iterations="10"/>'
           '<default><geom solref="%g 1" condim="%d" friction="%g %g 0.0001"/></default><worldbody>' % (solref, cond, mu, mu_t if pad == "ball" else 0)]
    # the cube's centre of mass is offset along y; its (massless) geometry is centred on the origin
    out.append("<body name='part'><freejoint/><inertial pos='0 %.6f 0' mass='%.8f' diaginertia='%.3e %.3e %.3e'/>"
               "<geom type='box' size='%.6f %.6f %.6f' mass='1e-9'/></body>"
               % (d_mm * 1e-3, m, inertia, inertia, inertia, h, h, h))
    for name, sgn in (("lo", -1), ("hi", 1)):
        if pad == "ball":
            g = "<geom type='sphere' size='%.6f' mass='0.2'/>" % BALL_R
            x = sgn * (h + BALL_R)
        else:
            g = "<geom type='box' size='0.001 %.6f %.6f' mass='0.2'/>" % (h, h)
            x = sgn * (h + 0.001)
        out.append("<body name='%s' pos='%.6f 0 0' gravcomp='1'><joint name='j%s' type='slide' axis='%d 0 0' damping='5'/>%s</body>"
                   % (name, x, name, -sgn, g))
    out.append("</worldbody><actuator>")
    for name in ("lo", "hi"):
        out.append("<general joint='j%s' gainprm='1' ctrlrange='-1000 1000'/>" % name)
    out.append("</actuator></mujoco>")
    return "".join(out)


def holds(side_mm, d_mm, force, mu, mu_t, pad, disp_mm=2.0, rot_deg=3.0, solref=0.0005):
    """True if the cube's centre moves < disp_mm and it turns < rot_deg over settle + hold."""
    m = mujoco.MjModel.from_xml_string(mjcf(side_mm, d_mm, mu, mu_t, pad, solref))
    d = mujoco.MjData(m)
    d.ctrl[:] = force
    mujoco.mj_forward(m, d)
    pid = m.body("part").id
    p0 = d.xpos[pid].copy()
    for _ in range(int((T_SETTLE + T_HOLD) / m.opt.timestep)):
        mujoco.mj_step(m, d)
        if np.linalg.norm(d.xpos[pid] - p0) * 1e3 >= disp_mm:
            return False
        if 2 * np.degrees(np.arccos(min(1.0, abs(d.xquat[pid][0])))) >= rot_deg:
            return False
    return True


def contact_count(side_mm, force, mu, pad):
    """Number of contact points between the part and the two pads at rest under `force`."""
    m = mujoco.MjModel.from_xml_string(mjcf(side_mm, 0.0, mu, 0.002, pad))
    d = mujoco.MjData(m)
    d.ctrl[:] = force
    for _ in range(500):
        mujoco.mj_step(m, d)
    pid = m.body("part").id
    return sum(1 for c in d.contact[: d.ncon]
               if pid in (m.geom_bodyid[c.geom1], m.geom_bodyid[c.geom2])
               and not (m.geom_bodyid[c.geom1] == m.geom_bodyid[c.geom2]))


def min_force(side_mm, d_mm, mu, mu_t, pad, hi=20.0, tol=0.02, solref=0.0005):
    """Smallest per-jaw force (N) at which the cube holds, by bisection; None if it fails at `hi`."""
    if not holds(side_mm, d_mm, hi, mu, mu_t, pad, solref=solref):
        return None
    lo = 0.0
    while hi - lo > tol * hi and hi - lo > 1e-4:
        mid = (lo + hi) / 2
        if holds(side_mm, d_mm, mid, mu, mu_t, pad, solref=solref):
            hi = mid
        else:
            lo = mid
    return hi

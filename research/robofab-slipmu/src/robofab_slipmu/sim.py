"""MuJoCo set-up for a bar held at one end by two force-driven pads (gravity only), measuring rotation RATE.

Copied from `robofab-slipmu` (itself from `robofab-liftload`); `az` is a constant upward gripper acceleration,
modelled as extra gravity in the gripper frame (g + az), which is exact for a constant vertical lift.
Copied and reduced from `robofab-liftload`. Instead of a pass/fail threshold, `run` returns the part's
rotation angle about the grasp axis over time, so the rate in a late window can be read off directly.
`condim` selects the contact model: 3 = sliding friction only, 4 = adds torsional friction (coefficient
`torsion`, in metres), 6 = adds rolling friction too.
"""
import mujoco
import numpy as np

from .model import DENSITY, G


def mjcf(length_mm, mu, condim, torsion, timeconst=0.004, impratio=1.0, pad_h=10.0, t=10.0, w=10.0, pad_t=4.0, az=0.0):
    s = 1e-3
    ext = (t / 2 * s, length_mm / 2 * s, w / 2 * s)
    ctr = (t / 2 * s, length_mm / 2 * s, w / 2 * s)
    fr = "%g %g 0.0001" % (mu, torsion)
    out = ['<mujoco><option timestep="0.0002" gravity="0 0 %g" cone="elliptic" impratio="%g"/><default><geom solref="%g 1" condim="%d"/></default><worldbody>' % (-(G + az), impratio, timeconst, condim),
           "<body name='part'><freejoint/><geom type='box' pos='%.6f %.6f %.6f' size='%.6f %.6f %.6f' density='%g' friction='%s'/></body>"
           % (*ctr, *ext, DENSITY, fr)]
    for name, sgn in (("lo", -1), ("hi", 1)):
        pos = [ctr[0] + sgn * (ext[0] + pad_t / 2 * s), pad_h / 2 * s, ctr[2]]
        size = [pad_t / 2 * s, pad_h / 2 * s, ext[2]]
        out.append("<body name='%s' pos='%.6f %.6f %.6f'><joint name='j%s' type='slide' axis='%d 0 0' damping='5'/>"
                   "<geom type='box' size='%.6f %.6f %.6f' friction='%s' mass='0.2'/></body>"
                   % (name, *pos, name, -sgn, *size, fr))
    out.append("</worldbody><actuator>")
    for name in ("lo", "hi"):
        out.append("<general joint='j%s' gainprm='1' ctrlrange='-1000 1000'/>" % name)
    out.append("</actuator></mujoco>")
    return "".join(out)


def run(length_mm, force, mu, condim=3, torsion=0.005, t_end=1.0, every=0.05, timeconst=0.004, impratio=1.0, az=0.0):
    """Return (times, angle_deg, drop_mm): rotation about the grasp axis (x) and centre-of-mass drop."""
    m = mujoco.MjModel.from_xml_string(mjcf(length_mm, mu, condim, torsion, timeconst, impratio, az=az))
    d = mujoco.MjData(m)
    d.ctrl[:] = force
    mujoco.mj_forward(m, d)
    p0 = d.xipos[1].copy()
    r0 = d.xmat[1].reshape(3, 3).copy()
    n = int(t_end / m.opt.timestep)
    k = int(every / m.opt.timestep)
    ts, ang, drop = [], [], []
    for i in range(1, n + 1):
        mujoco.mj_step(m, d)
        if i % k == 0:
            rel = d.xmat[1].reshape(3, 3) @ r0.T
            ang.append(float(np.degrees(np.arctan2(rel[2, 1], rel[1, 1]))))  # rotation about x
            drop.append(float((p0[2] - d.xipos[1][2]) * 1e3))
            ts.append(i * m.opt.timestep)
    return ts, ang, drop


def late_rate(ts, ang, window=0.4):
    """Least-squares slope (deg/s) of the angle over the last `window` seconds."""
    t = np.array(ts)
    a = np.array(ang)
    sel = t >= t[-1] - window
    return float(np.polyfit(t[sel], a[sel], 1)[0])

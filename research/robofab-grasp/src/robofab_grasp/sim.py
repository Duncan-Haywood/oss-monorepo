"""MuJoCo test: does a pair of force-driven jaw pads hold a part against gravity?

The part is a free rigid body (its boxes as geoms) in its own frame. Two pad bodies, each on a
slide joint along the grasp axis, are pushed together with a constant force `F` newtons each, and
the pad frame itself is fixed in space. Held if the part moves less than `disp_mm` in `t_end`.
The pad frame is fixed (no lift motion), so this tests the static hold under gravity only.
"""
import mujoco
import numpy as np

from .model import DENSITY, bbox


def mjcf(boxes, axis, force, mu, pad_t=4.0, gap=0.0):
    s = 1e-3
    bb = bbox(boxes)
    o = [k for k in range(3) if k != axis]
    out = ['<mujoco><option timestep="0.0002" gravity="0 0 -9.81" cone="elliptic"/><default><geom solref="0.004 1"/></default><worldbody>',
           "<body name='part'><freejoint/>"]
    for b in boxes:
        c = [(b[k] + b[k + 3]) / 2 * s for k in range(3)]
        h = [(b[k + 3] - b[k]) / 2 * s for k in range(3)]
        out.append("<geom type='box' pos='%.6f %.6f %.6f' size='%.6f %.6f %.6f' density='%g' friction='%g 0.005 0.0001'/>"
                   % (*c, *h, DENSITY, mu))
    out.append("</body>")
    ext = [(bb[k + 3] - bb[k]) / 2 * s + 0.0 for k in range(3)]
    ctr = [(bb[k] + bb[k + 3]) / 2 * s for k in range(3)]
    for name, sgn in (("lo", -1), ("hi", 1)):
        pos = list(ctr)
        pos[axis] = ctr[axis] + sgn * (ext[axis] + pad_t / 2 * s + gap * s)
        size = [ext[k] for k in range(3)]  # pad covers the full bounding-box face
        size[axis] = pad_t / 2 * s
        ax = [0, 0, 0]; ax[axis] = -sgn
        out.append("<body name='%s' pos='%.6f %.6f %.6f'><joint name='j%s' type='slide' axis='%d %d %d' "
                   "damping='5'/><geom type='box' size='%.6f %.6f %.6f' friction='%g 0.005 0.0001' mass='0.2'/></body>"
                   % (name, *pos, name, *ax, *size, mu))
    out.append("</worldbody><actuator>")
    for name in ("lo", "hi"):
        out.append("<general joint='j%s' gainprm='1' ctrlrange='-1000 1000'/>" % name)
    out.append("</actuator></mujoco>")
    return "".join(out)


def holds(boxes, axis, force, mu, t_end=0.5, disp_mm=2.0):
    m = mujoco.MjModel.from_xml_string(mjcf(boxes, axis, force, mu))
    d = mujoco.MjData(m)
    d.ctrl[:] = force
    mujoco.mj_forward(m, d)
    x0 = d.xipos[1].copy()
    for _ in range(int(t_end / m.opt.timestep)):
        mujoco.mj_step(m, d)
    return bool(np.linalg.norm(d.xipos[1] - x0) * 1e3 < disp_mm)


def min_force(boxes, axis, mu, hi=20.0, tol=0.02):
    """Smallest per-jaw force (N) at which the part holds, by bisection; None if it fails at `hi`."""
    if not holds(boxes, axis, hi, mu):
        return None
    lo = 0.0
    while hi - lo > tol * max(hi, 1e-9) and hi - lo > 1e-4:
        mid = (lo + hi) / 2
        if holds(boxes, axis, mid, mu):
            hi = mid
        else:
            lo = mid
    return hi

"""MuJoCo test of a force-driven jaw pair (copied from robofab-liftload, plus an `impratio` argument).

The pad frame is fixed and the load is applied as gravity (0, at, -(g+az)) in that frame; this is the
accelerating-frame equivalent of a constant-acceleration lift with no rotation, so no arm dynamics
and no ramp-up are modelled. Held if the part moves less than `disp_mm` and turns less than `rot_deg`.
"""
import mujoco
import numpy as np

from .model import DENSITY, G, bbox


def mjcf(boxes, axis, mu, az, at, pad_t=4.0, win=None, impratio=1.0):
    s = 1e-3
    bb = bbox(boxes)
    # the tangential in-plane direction: the pad-plane axis that is not vertical (z)
    tang = [k for k in range(3) if k not in (axis, 2)]
    gv = [0.0, 0.0, -(G + az)]
    if tang:
        gv[tang[0]] = at
    out = ['<mujoco><option timestep="0.0002" gravity="%g %g %g" cone="elliptic" impratio="%g"/><default><geom solref="0.004 1"/></default><worldbody>' % (*gv, impratio),
           "<body name='part'><freejoint/>"]
    for b in boxes:
        c = [(b[k] + b[k + 3]) / 2 * s for k in range(3)]
        h = [(b[k + 3] - b[k]) / 2 * s for k in range(3)]
        out.append("<geom type='box' pos='%.6f %.6f %.6f' size='%.6f %.6f %.6f' density='%g' friction='%g 0.005 0.0001'/>"
                   % (*c, *h, DENSITY, mu))
    out.append("</body>")
    ext = [(bb[k + 3] - bb[k]) / 2 * s for k in range(3)]
    ctr = [(bb[k] + bb[k + 3]) / 2 * s for k in range(3)]
    for name, sgn in (("lo", -1), ("hi", 1)):
        pos = list(ctr)
        pos[axis] = ctr[axis] + sgn * (ext[axis] + pad_t / 2 * s)
        size = list(ext)
        size[axis] = pad_t / 2 * s
        if win is not None:  # (tangent axis, lo_mm, hi_mm): pad covers only this window of the bounding box
            wa, lo, hi = win
            size[wa] = (hi - lo) / 2 * s
            pos[wa] = (lo + hi) / 2 * s
        ax = [0, 0, 0]
        ax[axis] = -sgn
        out.append("<body name='%s' pos='%.6f %.6f %.6f'><joint name='j%s' type='slide' axis='%d %d %d' damping='5'/>"
                   "<geom type='box' size='%.6f %.6f %.6f' friction='%g 0.005 0.0001' mass='0.2'/></body>"
                   % (name, *pos, name, *ax, *size, mu))
    out.append("</worldbody><actuator>")
    for name in ("lo", "hi"):
        out.append("<general joint='j%s' gainprm='1' ctrlrange='-1000 1000'/>" % name)
    out.append("</actuator></mujoco>")
    return "".join(out)


def holds(boxes, axis, force, mu, az=0.0, at=0.0, t_end=0.5, disp_mm=2.0, rot_deg=5.0, win=None, impratio=1.0):
    m = mujoco.MjModel.from_xml_string(mjcf(boxes, axis, mu, az, at, win=win, impratio=impratio))
    d = mujoco.MjData(m)
    d.ctrl[:] = force
    mujoco.mj_forward(m, d)
    x0, q0 = d.xipos[1].copy(), d.xquat[1].copy()
    for _ in range(int(t_end / m.opt.timestep)):
        mujoco.mj_step(m, d)
    moved = np.linalg.norm(d.xipos[1] - x0) * 1e3
    dot = min(1.0, abs(float(np.dot(q0, d.xquat[1]))))
    turned = np.degrees(2 * np.arccos(dot))
    return bool(moved < disp_mm and turned < rot_deg)


def min_force(boxes, axis, mu, az=0.0, at=0.0, hi=20.0, tol=0.02, win=None, impratio=1.0, rot_deg=5.0):
    """Smallest per-jaw force (N) that holds, by bisection; None if it fails at `hi`."""
    if not holds(boxes, axis, hi, mu, az, at, win=win, impratio=impratio, rot_deg=rot_deg):
        return None
    lo = 0.0
    while hi - lo > tol * max(hi, 1e-9) and hi - lo > 1e-4:
        mid = (lo + hi) / 2
        if holds(boxes, axis, mid, mu, az, at, win=win, impratio=impratio, rot_deg=rot_deg):
            hi = mid
        else:
            lo = mid
    return hi

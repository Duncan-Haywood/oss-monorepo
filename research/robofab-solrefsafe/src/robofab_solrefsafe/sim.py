"""MuJoCo test: do force-driven jaw pads hold a part while the whole jaw assembly accelerates?

Same set-up as robofab-graspmove (copied; `t_acc` is now a parameter), and the pads hang under a carrier body (two slide joints, z and side) whose motion follows a
prescribed constant-acceleration profile after a short settling time. Held if the part moves less
than `disp_mm` relative to the carrier during the run. Direction 'up' is +z; 'side' is horizontal
along the pad faces (the axis that is neither the grasp axis nor z).
"""
import mujoco
import numpy as np

from .model import DENSITY, bbox

T_SETTLE = 0.1
T_ACC = 0.05
UNSTABLE = [0]   # count of runs with a MuJoCo bad-acceleration warning (counted as 'not held')


def mjcf(boxes, axis, mu, pad_t=4.0, solref=0.0005, dt=0.0002, refsafe=True):
    s = 1e-3
    bb = bbox(boxes)
    ext = [(bb[k + 3] - bb[k]) / 2 * s for k in range(3)]
    ctr = [(bb[k] + bb[k + 3]) / 2 * s for k in range(3)]
    side_vec = (0, 1) if axis == 0 else (1, 0)   # horizontal axis along the pad faces
    out = ['<mujoco><option timestep="%g" gravity="0 0 -9.81" cone="elliptic" noslip_iterations="10"><flag refsafe="%s"/></option>'
           '<default><geom solref="%g 1"/></default><worldbody>' % (dt, "enable" if refsafe else "disable", solref),
           "<body name='part'><freejoint/>"]
    for b in boxes:
        c = [(b[k] + b[k + 3]) / 2 * s for k in range(3)]
        h = [(b[k + 3] - b[k]) / 2 * s for k in range(3)]
        out.append("<geom type='box' pos='%.6f %.6f %.6f' size='%.6f %.6f %.6f' density='%g' friction='%g 0.005 0.0001'/>"
                   % (*c, *h, DENSITY, mu))
    out.append("</body><body name='carrier' pos='0 0 0' gravcomp='1'><inertial pos='0 0 0' mass='1000' diaginertia='10 10 10'/><joint name='cz' type='slide' axis='0 0 1'/><joint name='cs' type='slide' axis='%d %d 0'/>" % side_vec)
    for name, sgn in (("lo", -1), ("hi", 1)):
        pos = list(ctr)
        pos[axis] = ctr[axis] + sgn * (ext[axis] + pad_t / 2 * s)
        size = list(ext)
        size[axis] = pad_t / 2 * s
        ax = [0, 0, 0]; ax[axis] = -sgn
        out.append("<body name='%s' pos='%.6f %.6f %.6f' gravcomp='1'><joint name='j%s' type='slide' axis='%d %d %d' damping='5'/>"
                   "<geom type='box' size='%.6f %.6f %.6f' friction='%g 0.005 0.0001' mass='0.2'/></body>"
                   % (name, *pos, name, *ax, *size, mu))
    out.append("</body></worldbody><actuator>")
    for name in ("lo", "hi"):
        out.append("<general joint='j%s' gainprm='1' ctrlrange='-1000 1000'/>" % name)
    out.append("</actuator></mujoco>")
    return "".join(out)


def holds(boxes, axis, force, mu, a_up=0.0, a_side=0.0, disp_mm=2.0, solref=0.0005, t_acc=T_ACC, dt=0.0002, refsafe=True):
    m = mujoco.MjModel.from_xml_string(mjcf(boxes, axis, mu, solref=solref, dt=dt, refsafe=refsafe))
    d = mujoco.MjData(m)
    d.ctrl[:] = force
    mujoco.mj_forward(m, d)
    pid = m.body("part").id
    cid = m.body("carrier").id
    qz, qs = m.joint("cz").qposadr[0], m.joint("cs").qposadr[0]
    vz, vs = m.joint("cz").dofadr[0], m.joint("cs").dofadr[0]
    rel0 = d.xipos[pid] - d.xpos[cid]
    dt = m.opt.timestep
    worst = 0.0
    for i in range(int((T_SETTLE + t_acc) / dt)):
        t = max(0.0, i * dt - T_SETTLE)
        d.qpos[qz], d.qvel[vz] = 0.5 * a_up * t * t, a_up * t   # carrier motion is prescribed
        d.qpos[qs], d.qvel[vs] = 0.5 * a_side * t * t, a_side * t
        mujoco.mj_step(m, d)
        dist = np.linalg.norm(d.xipos[pid] - d.xpos[cid] - rel0)
        if not np.isfinite(dist):   # max() would silently ignore NaN
            UNSTABLE[0] += 1
            return False
        worst = max(worst, dist)
    if d.warning[mujoco.mjtWarning.mjWARN_BADQACC].number > 0:   # solver blew up at some step
        UNSTABLE[0] += 1
        return False
    return bool(worst * 1e3 < disp_mm)


def min_force(boxes, axis, mu, a_up=0.0, a_side=0.0, hi=20.0, tol=0.02, solref=0.0005, t_acc=T_ACC, dt=0.0002, refsafe=True):
    """Smallest per-jaw force (N) at which the part holds, by bisection; None if it fails at `hi`."""
    if not holds(boxes, axis, hi, mu, a_up, a_side, solref=solref, t_acc=t_acc, dt=dt, refsafe=refsafe):
        return None
    lo = 0.0
    while hi - lo > tol * max(hi, 1e-9) and hi - lo > 1e-4:
        mid = (lo + hi) / 2
        if holds(boxes, axis, mid, mu, a_up, a_side, solref=solref, t_acc=t_acc, dt=dt, refsafe=refsafe):
            hi = mid
        else:
            lo = mid
    return hi

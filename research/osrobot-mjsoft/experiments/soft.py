"""osrobot-mjsoft: the osrobot-mjfeed spoon-feeding trial with the lips replaced by a bonded soft-tissue layer.
MuJoCo integrates the tip (two slide joints, the same controller, constants and sway as osrobot-mjfeed); its own
contact is switched off and the lip force comes from the osrobot-mjlayer law F(delta) (Hertz sphere on a layer of
thickness h bonded to bone, Dimitriadis bottom-effect polynomial), plus viscous damping and a stiff bone stop.
"""
import math, random, sys
from pathlib import Path
import mujoco

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "osrobot-mjfeed" / "src"))
sys.path.insert(0, str(HERE.parents[1] / "osrobot-mjlayer" / "experiments"))
import osrobot_mjfeed.model as fm      # noqa: E402
import run as layer                    # noqa: E402  (osrobot-mjlayer: force law)

DT, T_MAX = fm.DT, fm.T_MAX
R_TIP, R_MOUTH = fm.R_TIP, fm.R_MOUTH
BONE_FRAC, K_BONE = 0.9, 1.0e5        # bone stop begins at 0.9 h (my choice); 1e5 N/m stiffness (ASSUMED, bone is far stiffer than tissue)

XML = f"""
<mujoco><option timestep="{DT}" gravity="0 0 0" integrator="implicit"/>
 <worldbody><body name="tip" pos="0 0 0">
   <joint name="jx" type="slide" axis="1 0 0"/><joint name="jy" type="slide" axis="0 1 0"/>
   <geom type="sphere" size="{R_TIP}" mass="{fm.M_TIP}" contype="0" conaffinity="0"/></body></worldbody>
 <actuator><motor joint="jx" gear="1"/><motor joint="jy" gear="1"/></actuator>
</mujoco>"""
MODEL = mujoco.MjModel.from_xml_string(XML)
# lip blocks as osrobot-mjfeed: centre (0.02, +-(R_MOUTH+0.05)) relative to the mouth, half sizes (0.02, 0.05)
LIPS = ((0.02, R_MOUTH + 0.05), (0.02, -R_MOUTH - 0.05))
HALF = (0.02, 0.05)


def tissue_force(delta, vn, e_pa, h, b):
    """Normal force [N] at penetration delta [m] and penetration rate vn [m/s]: layer law + damping + bone stop."""
    if delta <= 0.0:
        return 0.0
    dd = min(delta, BONE_FRAC * h)
    f = layer.force(dd, R_TIP, e_pa, h)
    if delta > dd:
        f += K_BONE * (delta - dd)
    return max(0.0, f + b * vn)


def lip_contact(x, y, mouth_y, lip):
    """(penetration, nx, ny) of the tip sphere into the axis-aligned lip block; normal points out of the block."""
    cx, cy = LIPS[lip][0], mouth_y + LIPS[lip][1]
    dx, dy = x - cx, y - cy
    qx, qy = max(-HALF[0], min(HALF[0], dx)), max(-HALF[1], min(HALF[1], dy))
    ex, ey = dx - qx, dy - qy
    dist = math.hypot(ex, ey)
    if dist > 0.0:
        return R_TIP - dist, ex / dist, ey / dist
    # centre inside the block: leave by the nearest face
    gaps = ((HALF[0] - dx, 1, 0), (HALF[0] + dx, -1, 0), (HALF[1] - dy, 0, 1), (HALF[1] + dy, 0, -1))
    g, nx, ny = min(gaps)
    return R_TIP + g, nx, ny


def run_trial(design, amp, seed, e_pa, h, b, offset=0.0):
    """One spoonful. Returns entered, t, peak force (N), peak depth over h, steady push (N, last second mean)."""
    m = MODEL
    d = mujoco.MjData(m)
    rng = random.Random(seed)
    base = fm.sway(amp, rng)
    sway_fn = lambda t: base(t) + offset      # offset: fixed shift of the whole mouth, to block a blind arm
    d.qpos[0], d.qpos[1] = fm.X_START, sway_fn(0.0)
    mujoco.mj_forward(m, d)
    y_meas, next_meas = sway_fn(0.0), 0.0
    peak = peak_depth = 0.0
    tail, t = [], 0.0
    cap = fm.F_ACT if design.f_cap is None else min(fm.F_ACT, design.f_cap)
    prev_mouth = sway_fn(0.0)
    while t < T_MAX:
        x, y, vx, vy = d.qpos[0], d.qpos[1], d.qvel[0], d.qvel[1]
        if design.sense == "camera" and t >= next_meas:
            y_meas = sway_fn(max(0.0, t - design.delay)) + rng.gauss(0.0, design.sigma)
            next_meas += 1.0 / design.rate
        y_target = y_meas if design.sense == "camera" else 0.0
        inside = abs(y - sway_fn(t)) <= R_MOUTH
        aligned = abs(y - y_target) <= 0.5 * R_MOUTH
        if design.sense == "camera" and not aligned and x < -0.02:
            x_ref = x
        else:
            x_ref = min(fm.X_DEPTH, x + design.v_app * fm.LEAD)
        fx = max(-fm.F_ACT, min(cap, fm.KP * (x_ref - x) - fm.KD * vx))
        fy = max(-fm.F_ACT, min(fm.F_ACT, fm.KP * (y_target - y) - fm.KD * vy))
        if vx > design.v_app and fx > 0:
            fx = 0.0
        mouth = sway_fn(t + DT)
        mvy = (mouth - prev_mouth) / DT          # lip velocity along y (lips only sway in y)
        prev_mouth = mouth
        fcx = fcy = ftot = 0.0
        for lip in (0, 1):
            pen, nx, ny = lip_contact(x, y, mouth, lip)
            if pen > 0.0:
                vn = -((vx * nx) + (vy - mvy) * ny)   # penetration rate = - (relative velocity . outward normal)
                f = tissue_force(pen, vn, e_pa, h, b)
                fcx += f * nx; fcy += f * ny; ftot += f
                peak_depth = max(peak_depth, pen / h)
        d.ctrl[0], d.ctrl[1] = fx, fy
        d.qfrc_applied[0], d.qfrc_applied[1] = fcx, fcy
        mujoco.mj_step(m, d)
        t += DT
        tail.append(ftot)
        if len(tail) > 500:
            tail.pop(0)
        peak = max(peak, ftot)
        if d.qpos[0] >= 0.0 and abs(d.qpos[1] - sway_fn(t)) <= R_MOUTH:
            break
    ok = d.qpos[0] >= 0.0 and abs(d.qpos[1] - sway_fn(t)) <= R_MOUTH
    return {"entered": ok, "t": t, "peak": peak, "depth": peak_depth, "push": sum(tail) / max(1, len(tail))}

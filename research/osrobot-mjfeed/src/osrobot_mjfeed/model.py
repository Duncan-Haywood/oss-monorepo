"""The osrobot-assist spoon-feeding trial re-run in MuJoCo. Same controller, constants and sway as
research/osrobot-assist/src/osrobot_assist/model.py; the planar point mass and hand-written lip wall are replaced by
a MuJoCo sphere on two slide joints and two box lips (a mocap body that sways) with MuJoCo's soft contact.
Every constant marked ASSUMED is a round number, not a measurement of a person or product."""
import math, random
import mujoco
import numpy as _np

_F6 = _np.zeros(6)

DT = 0.002
M_TIP = 0.30; KP, KD = 400.0, 28.0; F_ACT = 20.0       # as osrobot-assist (ASSUMED)
K_LIP, B_LIP = 800.0, 4.0     # N/m, N s/m: contact stiffness and damping as MuJoCo solref (-K, -B) (ASSUMED)
R_MOUTH = 0.012; X_START, X_DEPTH = -0.10, 0.015
R_TIP = 0.004                 # m, spoon-tip sphere radius (ASSUMED)
LEAD = 0.05; T_MAX = 12.0; F_SAFE = 2.0

def xml(k=K_LIP, b=B_LIP):
    return f"""
<mujoco><option timestep="{DT}" gravity="0 0 0" integrator="implicit"/>
 <worldbody>
  <body name="tip" pos="0 0 0">
   <joint name="jx" type="slide" axis="1 0 0"/><joint name="jy" type="slide" axis="0 1 0"/>
   <geom name="spoon" type="sphere" size="{R_TIP}" mass="{M_TIP}" solref="-{k} -{b}" friction="0 0 0"/>
  </body>
  <body name="lipA" mocap="true" pos="0 0 0"><geom name="la" type="box" size="0.02 0.05 0.02" pos="0.02 {R_MOUTH + 0.05} 0"
     solref="-{k} -{b}" friction="0 0 0"/></body>
  <body name="lipB" mocap="true" pos="0 0 0"><geom name="lb" type="box" size="0.02 0.05 0.02" pos="0.02 {-R_MOUTH - 0.05} 0"
     solref="-{k} -{b}" friction="0 0 0"/></body>
 </worldbody>
 <actuator><motor name="fx" joint="jx" gear="1"/><motor name="fy" joint="jy" gear="1"/></actuator>
</mujoco>"""


class Design:
    """sense: 'none' or 'camera'. v_app m/s; f_cap N or None; delay s; sigma m; rate Hz (as osrobot-assist)."""
    def __init__(self, sense="camera", v_app=0.05, f_cap=None, delay=0.10, sigma=0.003, rate=15.0):
        self.sense, self.v_app, self.f_cap = sense, v_app, f_cap
        self.delay, self.sigma, self.rate = delay, sigma, rate


def sway(amp, rng):
    """Same two-sinusoid mouth sway and random-number order as osrobot-assist."""
    p1, p2 = rng.random() * 2 * math.pi, rng.random() * 2 * math.pi
    f1, f2 = 0.25 + 0.1 * rng.random(), 0.9 + 0.3 * rng.random()
    return lambda t: amp * (math.sin(2 * math.pi * f1 * t + p1) + 0.33 * math.sin(2 * math.pi * f2 * t + p2))


_MODEL = mujoco.MjModel.from_xml_string(xml())


def build(k=K_LIP, b=B_LIP):
    """A model with lip contact stiffness k (N/m) and damping b (N s/m)."""
    return mujoco.MjModel.from_xml_string(xml(k, b))


def run_trial(design, amp, seed, offset=0.0, m=None):
    """Feed one spoonful. Returns dict: entered, t, peak (N, peak summed MuJoCo contact normal force, any direction), peak_ax (N, the part along the approach axis), contact_s."""
    m = m or _MODEL
    d = mujoco.MjData(m)
    rng = random.Random(seed)
    sway_fn = sway(amp, rng)
    mouth = lambda t: sway_fn(t) + offset    # offset: a fixed shift of the whole mouth, to block a blind arm
    d.qpos[0], d.qpos[1] = X_START, mouth(0.0)
    d.mocap_pos[0] = (0.0, mouth(0.0), 0.0); d.mocap_pos[1] = d.mocap_pos[0]
    mujoco.mj_forward(m, d)
    y_meas, next_meas = mouth(0.0), 0.0
    peak, peak_ax, contact_s, t = 0.0, 0.0, 0.0, 0.0
    tail = []                 # contact force over the last second, for the steady push
    cap = F_ACT if design.f_cap is None else min(F_ACT, design.f_cap)
    while t < T_MAX:
        x, y, vx, vy = d.qpos[0], d.qpos[1], d.qvel[0], d.qvel[1]
        if design.sense == "camera" and t >= next_meas:
            y_meas = mouth(max(0.0, t - design.delay)) + rng.gauss(0.0, design.sigma)
            next_meas += 1.0 / design.rate
        y_target = y_meas if design.sense == "camera" else 0.0
        y_now = mouth(t)
        inside = abs(y - y_now) <= R_MOUTH
        aligned = abs(y - y_target) <= 0.5 * R_MOUTH
        if design.sense == "camera" and not aligned and x < -0.02:
            x_ref = x
        else:
            x_ref = min(X_DEPTH, x + design.v_app * LEAD)
        fx = max(-F_ACT, min(cap, KP * (x_ref - x) - KD * vx))
        fy = max(-F_ACT, min(F_ACT, KP * (y_target - y) - KD * vy))
        if vx > design.v_app and fx > 0:
            fx = 0.0
        d.ctrl[0], d.ctrl[1] = fx, fy
        mouth_y = mouth(t + DT)       # lips take the mouth position for the step about to be taken
        d.mocap_pos[0] = (0.0, mouth_y, 0.0); d.mocap_pos[1] = d.mocap_pos[0]
        mujoco.mj_step(m, d)
        t += DT
        fc, fax = 0.0, 0.0
        for i in range(d.ncon):
            mujoco.mj_contactForce(m, d, i, _F6)
            fc += abs(_F6[0])
            fax += abs((d.contact[i].frame.reshape(3, 3).T @ _F6[:3])[0])   # push along the approach axis
        tail.append(fc)
        if len(tail) > 500:
            tail.pop(0)
        if fc > 0.0:
            peak = max(peak, fc); peak_ax = max(peak_ax, fax); contact_s += DT
        if d.qpos[0] >= 0.0 and abs(d.qpos[1] - mouth(t)) <= R_MOUTH:
            return {"entered": True, "t": t, "peak": peak, "peak_ax": peak_ax, "contact_s": contact_s, "f_tail": sum(tail) / max(1, len(tail))}
    return {"entered": False, "t": t, "peak": peak, "peak_ax": peak_ax, "contact_s": contact_s, "f_tail": sum(tail) / max(1, len(tail))}


def summarise(design, amp, seeds, trial=run_trial):
    rs = [trial(design, amp, s) for s in seeds]
    n = len(rs)
    ok = [r for r in rs if r["entered"]]
    return {
        "success": len(ok) / n,
        "safe": sum(1 for r in rs if r["entered"] and r["peak"] <= F_SAFE) / n,
        "touch": sum(1 for r in rs if r["contact_s"] > 0) / n,
        "peak_mean": sum(r["peak"] for r in rs) / n,
        "peak_max": max(r["peak"] for r in rs),
        "ax_mean": sum(r["peak_ax"] for r in rs) / n if "peak_ax" in rs[0] else float("nan"),
        "ax_max": max(r["peak_ax"] for r in rs) if "peak_ax" in rs[0] else float("nan"),
        "time_mean": (sum(r["t"] for r in ok) / len(ok)) if ok else float("nan"),
    }

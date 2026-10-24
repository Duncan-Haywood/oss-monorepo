"""Plant C: the person-led sheet lift in MuJoCo, same abstraction as buildbot-skills plant B, a different integrator and code.

Two rigid halves (boxes, mass m/2, length L/2) hinged at the person's pin and at the midline; a spring-damper on the
midline joint; the robot's force is applied at the far end. The person's pin is fixed in the simulation frame and the
frame's acceleration is put into gravity (g_eff = g + aP), which is exact for a pin moving vertically. Delay, actuator
lag and the controller are written here in Python, as in buildbot-skills, so only the rigid-body dynamics differ.
"""
import sys
from pathlib import Path

import mujoco
import numpy as np

sys.path[:0] = [str(Path(__file__).resolve().parents[3] / "buildbot-skills" / "src")]
from buildbot_skills import model as M  # noqa: E402

G, L = M.G, M.L
XML = """
<mujoco model="sheet">
  <option timestep="0.001" integrator="RK4" gravity="0 0 -9.81"/>
  <worldbody>
    <body name="h1">
      <joint name="j1" type="hinge" axis="0 -1 0" damping="0"/>
      <inertial pos="{lh} 0 0" mass="{mi}" diaginertia="{ii} {ii} {ii}"/>
      <body name="h2" pos="{l} 0 0">
        <joint name="j2" type="hinge" axis="0 -1 0" stiffness="{kf}" damping="{cf}"/>
        <inertial pos="{lh} 0 0" mass="{mi}" diaginertia="{ii} {ii} {ii}"/>
      </body>
    </body>
  </worldbody>
</mujoco>
"""


def build(m, kflex):
    l = L / 2.0
    mi = m / 2.0
    cf = 0.05 * np.sqrt(kflex * m * L * L / 12.0)
    return mujoco.MjModel.from_xml_string(XML.format(l=l, lh=l / 2, mi=mi, ii=mi * l * l / 12.0, kf=kflex, cf=cf)), cf


def episode(w, pol, i, dt=1e-3, settle=1.0, extra=1.5, damp_settle=25.0):
    """One episode of world index i (dict of arrays from buildbot_skills.model.draw_world(kind='B')). Returns the same metrics as M.simulate."""
    m, T, lag = float(w["m"][i]), float(w["T"][i]), float(w["lag"][i])
    kf = float(w["kflex"][i])
    mod, cf = build(m, kf)
    d = mujoco.MjData(mod)
    l = L / 2.0
    K, B, Ki = float(pol["K"]), float(pol["B"]), float(pol["Ki"])
    ffz = float(w["ffr"][i]) * 0.5 * m * G
    ta, bias = float(w["tau_a"][i]), float(w["bias"][i])
    dly = int(round(float(w["delay"][i]) / dt))
    steps = int((T + lag + extra + settle) / dt)
    ring = np.zeros((dly + 2, 4))
    Fa = np.array([0.0, ffz])
    Iz = 0.0
    peak_t = 0.0
    peak_p = 0.0
    tilt = 0.0
    Fx = Fz = 0.0
    bad = False
    j2dmp = mod.dof_damping[1]
    vprev = 0.0
    for k in range(steps):
        t = k * dt - settle
        zP, vP, aP = M._path(np.array(t), T)
        zref = float(M._path(np.array(t - lag), T)[0]) + bias
        zP, vP, aP = float(zP), float(vP), float(aP)
        mod.opt.gravity[2] = -(G + aP)
        mod.dof_damping[1] = j2dmp * (1.0 if t >= 0 else damp_settle)
        th1, th2 = d.qpos[0], d.qpos[0] + d.qpos[1]
        w1, w2 = d.qvel[0], d.qvel[0] + d.qvel[1]
        Rx = l * np.cos(th1) + l * np.cos(th2)
        Rz = zP + l * np.sin(th1) + l * np.sin(th2)
        Rvx = -l * np.sin(th1) * w1 - l * np.sin(th2) * w2
        Rvz = vP + l * np.cos(th1) * w1 + l * np.cos(th2) * w2
        ring[k % len(ring)] = (Rx, Rz, Rvx, Rvz)
        mx, mz, mvx, mvz = ring[(k - dly) % len(ring)]
        Fxc, Fzc = M._controller(mx, mz, mvx, mvz, zref, ffz, K, B, Ki, Iz)
        Fa = Fa + (np.array([Fxc, Fzc]) - Fa) * (dt / ta)
        Fx, Fz = Fa
        # robot force at the far end of half 2; MuJoCo's x-z plane: force (Fx, 0, Fz)
        d.qfrc_applied[:] = 0.0
        end = np.array([Rx, 0.0, Rz - zP])
        mujoco.mj_applyFT(mod, d, np.array([Fx, 0.0, Fz]), np.zeros(3), end, 2, d.qfrc_applied)
        mujoco.mj_step(mod, d)
        if not np.isfinite(d.qpos).all() or abs(Rz - zP) > 5 * L:
            bad = True
            break
        Iz += (zref - Rz) * dt
        tilt = float(np.arctan2(Rz - zP, Rx))
        if t >= -dt:
            # the pin's reaction from the sheet's momentum balance in the accelerating frame: m (a_cm + g + aP) - Fz
            mujoco.mj_forward(mod, d)
            vcm = float(d.subtree_linvel[1][2])
            if t >= 0:
                peak_t = max(peak_t, abs(tilt))
                peak_p = max(peak_p, (m * ((vcm - vprev) / dt + aP + G) - Fz) / G)
            vprev = vcm
    ok = (not bad) and np.degrees(peak_t) < 30
    return {"peak_tilt_deg": float(np.degrees(peak_t)) if not bad else float("nan"),
            "end_tilt_deg": abs(float(np.degrees(tilt))) if not bad else float("nan"),
            "person_kg_peak": peak_p if not bad else float("nan"), "ok": bool(ok)}


def run_batch(w, pol, idx):
    out = [episode(w, pol, int(i)) for i in idx]
    return {k: np.array([o[k] for o in out]) for k in out[0]}

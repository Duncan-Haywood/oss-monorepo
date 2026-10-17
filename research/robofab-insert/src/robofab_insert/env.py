"""Planar peg-in-hole in MuJoCo at several simulator fidelity levels.

A 10 mm wide, 40 mm tall peg hangs from three position actuators (x, z, tilt) that
stand in for a compliant gripper. Two fixed walls form a hole with chamfered lips.
All lengths are in metres internally; the study's own dimensions, not a real part.
"""
from dataclasses import dataclass, replace
import numpy as np
import mujoco

PEG_HALF_W = 0.005
PEG_HALF_H = 0.020
WALL_DEPTH = 0.030
CHAMFER = 0.0015  # horizontal and vertical extent of the 45-degree lead-in on each lip
SUCCESS_DEPTH = 0.015  # peg tip this far below the hole mouth counts as inserted


@dataclass(frozen=True)
class Fidelity:
    """Simulator settings. The numbers are choices for this study, not measurements."""
    name: str
    friction: float
    timestep: float
    solref_t: float      # contact time constant (s); larger = softer contacts
    tilt_free: bool      # False locks peg rotation (2-D translation-only model)
    kp_x: float          # gripper lateral stiffness (N/m)
    kp_z: float          # gripper vertical stiffness (N/m)
    kp_tilt: float       # gripper rotational stiffness (N m/rad)
    damping: float       # joint damping (all three joints)


L0 = Fidelity("L0", 0.0, 0.004, 0.012, False, 4000.0, 4000.0, 0.5, 20.0)
L1 = Fidelity("L1", 0.3, 0.004, 0.012, True, 4000.0, 4000.0, 0.5, 20.0)
L2 = Fidelity("L2", 0.5, 0.001, 0.003, True, 4000.0, 4000.0, 0.5, 20.0)
# Held-out reference ("target"): none of the training levels matches it.
TARGET = Fidelity("T", 0.8, 0.002, 0.005, True, 2500.0, 5000.0, 0.25, 8.0)
LEVELS = {f.name: f for f in (L0, L1, L2, TARGET)}


def make_model(fid: Fidelity, clearance: float) -> mujoco.MjModel:
    gap = PEG_HALF_W + clearance  # hole half-width
    wall_w = 0.02
    solref = f"{fid.solref_t} 1"
    c = CHAMFER
    ch_len = c * 2 ** 0.5 / 2 + 0.0003  # half-length of the thin slab that forms each lead-in
    xml = f"""
<mujoco>
  <option timestep="{fid.timestep}" gravity="0 0 -9.81" integrator="implicitfast"/>
  <default><geom solref="{solref}" friction="{fid.friction} 0.001 0.0001" condim="3"/></default>
  <worldbody>
    <geom name="wl" type="box" pos="{-gap - wall_w:.6f} 0 {-(WALL_DEPTH + c)/2:.6f}" size="{wall_w} 0.02 {(WALL_DEPTH - c)/2}"/>
    <geom name="wr" type="box" pos="{gap + wall_w:.6f} 0 {-(WALL_DEPTH + c)/2:.6f}" size="{wall_w} 0.02 {(WALL_DEPTH - c)/2}"/>
    <geom name="cl" type="box" pos="{-gap - c/2:.6f} 0 {-c/2:.6f}" size="{ch_len:.6f} 0.02 0.0002" euler="0 -45 0"/>
    <geom name="cr" type="box" pos="{gap + c/2:.6f} 0 {-c/2:.6f}" size="{ch_len:.6f} 0.02 0.0002" euler="0 45 0"/>
    <geom name="floor" type="box" pos="0 0 {-WALL_DEPTH - 0.006:.6f}" size="0.05 0.02 0.006"/>
    <body name="peg" pos="0 0 0.03">
      <joint name="jx" type="slide" axis="1 0 0" damping="{fid.damping}"/>
      <joint name="jz" type="slide" axis="0 0 1" damping="{fid.damping}"/>
      <joint name="jt" type="hinge" axis="0 1 0" damping="{fid.damping * 0.01}" {'' if fid.tilt_free else 'range="-0.0005 0.0005" limited="true"'}/>
      <geom name="peg" type="box" size="{PEG_HALF_W} 0.02 {PEG_HALF_H}" mass="0.2" pos="0 0 0"/>
    </body>
  </worldbody>
  <actuator>
    <position name="ax" joint="jx" kp="{fid.kp_x}" ctrlrange="-0.05 0.05"/>
    <position name="az" joint="jz" kp="{fid.kp_z}" ctrlrange="-0.2 0.2"/>
    <position name="at" joint="jt" kp="{fid.kp_tilt}" ctrlrange="-1 1"/>
  </actuator>
</mujoco>"""
    return mujoco.MjModel.from_xml_string(xml)


@dataclass(frozen=True)
class Scenario:
    """Per-episode randomised quantities (the 'task distribution')."""
    clearance: float    # per-side clearance (m)
    x_error: float      # true peg x offset from hole centre at start (m)
    tilt0: float        # initial tilt (rad)
    perception: float   # error in the controller's estimate of hole x (m)


def sample_scenario(rng: np.random.Generator) -> Scenario:
    return Scenario(
        clearance=float(rng.uniform(0.0002, 0.0006)),
        x_error=float(rng.uniform(-0.003, 0.003)),
        tilt0=float(np.deg2rad(rng.uniform(-4.0, 4.0))),
        perception=float(rng.normal(0.0, 0.0010)),
    )


def randomise_fidelity(rng: np.random.Generator) -> Fidelity:
    """Domain randomisation over simulator parameters (training only)."""
    return Fidelity(
        "DR",
        friction=float(rng.uniform(0.0, 0.9)),
        timestep=float(rng.choice([0.001, 0.002, 0.004])),
        solref_t=float(rng.uniform(0.0035, 0.014)),
        tilt_free=bool(rng.random() < 0.8),
        kp_x=float(rng.uniform(2000, 5000)),
        kp_z=float(rng.uniform(2000, 5000)),
        kp_tilt=float(rng.uniform(0.2, 0.6)),
        damping=float(rng.uniform(5, 25)),
    )


# Policy parameters (all in SI units); bounds used by the optimiser.
PARAM_NAMES = ("descent_speed", "max_lead", "wiggle_amp", "wiggle_hz", "tilt_gain")
PARAM_LO = np.array([0.002, 0.0001, 0.0, 0.5, 0.0])
PARAM_HI = np.array([0.040, 0.0020, 0.0020, 8.0, 3.0])
NAIVE = np.array([0.020, 0.0020, 0.0, 1.0, 0.0])  # straight push, no search


def rollout(params: np.ndarray, fid: Fidelity, sc: Scenario, t_max: float = 4.0) -> dict:
    """Run one insertion. Returns success flag and the final depth (m, positive = in)."""
    v, lead, amp, hz, tg = [float(p) for p in np.clip(params, PARAM_LO, PARAM_HI)]
    m = make_model(fid, sc.clearance)
    d = mujoco.MjData(m)
    jx, jz, jt = (m.joint(n).qposadr[0] for n in ("jx", "jz", "jt"))
    # peg centre starts with its tip 6 mm above the mouth
    z_start = PEG_HALF_H + 0.006
    d.qpos[jx] = sc.x_error
    d.qpos[jz] = z_start - 0.03  # body origin offset is 0.03 in the XML
    d.qpos[jt] = sc.tilt0 if fid.tilt_free else 0.0
    mujoco.mj_forward(m, d)
    x_target = -sc.perception  # controller aims at its (noisy) estimate of the hole centre
    z_cmd = z_start
    steps = int(t_max / fid.timestep)
    best_depth = -1.0
    for i in range(steps):
        t = i * fid.timestep
        # descend, but never let the command lead the measured position by more than max_lead
        z_cmd = max(z_cmd - v * fid.timestep, (d.qpos[jz] + 0.03) - lead)
        x_cmd = x_target + amp * np.sin(2 * np.pi * hz * t)
        d.ctrl[0] = x_cmd
        d.ctrl[1] = z_cmd - 0.03
        d.ctrl[2] = -tg * d.qpos[jt]  # simple tilt feedback on top of the position servo
        mujoco.mj_step(m, d)
        depth = -(d.qpos[jz] + 0.03 - PEG_HALF_H)
        best_depth = max(best_depth, depth)
        if depth >= SUCCESS_DEPTH and abs(d.qpos[jx]) < PEG_HALF_W + sc.clearance:
            return {"success": True, "depth": depth, "time": t}
        if not np.isfinite(d.qpos).all():
            break
    return {"success": False, "depth": float(best_depth), "time": t_max}

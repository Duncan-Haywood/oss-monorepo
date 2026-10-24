"""Identify the servo parameters that no datasheet gives (position-loop gain, back-EMF
damping, reflected inertia, Coulomb friction, stall torque) from step responses.

Rig: one servo with a horizontal axis carrying a printed bar and a known mass (a pendulum).
Command a schedule of small and large position steps at 100 Hz, log the commanded and
measured positions, then fit the twin's single-joint model to the log by simulation error.
Large steps saturate the loop and expose stall torque and damping (the torque-speed line);
small steps expose the gain, inertia and friction.

``synthetic_log`` makes a log from known parameters so the fit can be checked
(tests/test_sysid.py): the method is validated in simulation only; a hardware log is the
next step and must be added before the fitted values are trusted for the real robot.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import mujoco
import numpy as np

from .params import DEFAULT

PARAMS = ("kp", "damping", "armature", "friction", "stall")


@dataclass
class Rig:
    """Pendulum on the servo horn. It must be heavy enough that its gravity torque and inertia
    are not swamped by the servo's reflected rotor inertia (0.028 kg*m^2): with 0.1 kg at
    10 cm the overall scale of the parameters is only weakly identifiable (experiments/
    analyze.py found a fit 12 % off on every parameter with the same residual)."""

    arm_mass: float = 0.50  # kg at the end of the bar (e.g. a bag of M8 nuts, weighed)
    arm_length: float = 0.15  # m, axis to the mass
    bar_mass: float = 0.03  # kg, printed bar


def rig_xml(theta: dict, rig: Rig = Rig(), timestep: float = 0.001) -> str:
    I_bar = rig.bar_mass * rig.arm_length ** 2 / 3
    I = rig.arm_mass * rig.arm_length ** 2 + I_bar
    com = (rig.arm_mass * rig.arm_length + rig.bar_mass * rig.arm_length / 2) / (rig.arm_mass + rig.bar_mass)
    m = rig.arm_mass + rig.bar_mass
    Icom = max(I - m * com ** 2, 1e-7)
    f = theta["stall"]
    return f"""<mujoco><option timestep="{timestep}" integrator="implicitfast"/>
<worldbody><body name="arm"><joint name="j" type="hinge" axis="0 1 0" damping="{theta['damping']:.6g}"
 armature="{theta['armature']:.6g}" frictionloss="{theta['friction']:.6g}"/>
<inertial pos="{com:.6g} 0 0" mass="{m:.6g}" diaginertia="{Icom:.6g} {Icom:.6g} {Icom:.6g}"/></body></worldbody>
<actuator><position joint="j" kp="{theta['kp']:.6g}" forcerange="{-f:.6g} {f:.6g}"/></actuator></mujoco>"""


def schedule(seed: int = 0, seconds: float = 12.0, hz: float = 100.0) -> np.ndarray:
    """Commanded positions: alternating small (2-10 deg) and large (30-90 deg) steps."""
    rng = np.random.default_rng(seed)
    n = int(seconds * hz)
    cmd = np.zeros(n)
    t, q = 0, 0.0
    big = False
    while t < n:
        hold = int(rng.uniform(0.4, 0.9) * hz)
        size = math.radians(rng.uniform(30, 90) if big else rng.uniform(2, 10))
        q = float(np.clip(q + size * rng.choice([-1, 1]), -1.6, 1.6))
        cmd[t:t + hold] = q
        t += hold
        big = not big
    return cmd


def simulate(theta: dict, cmd: np.ndarray, rig: Rig = Rig(), hz: float = 100.0) -> np.ndarray:
    m = mujoco.MjModel.from_xml_string(rig_xml(theta, rig))
    d = mujoco.MjData(m)
    n_sub = int(round(1.0 / (hz * m.opt.timestep)))
    out = np.empty(len(cmd))
    for k, c in enumerate(cmd):
        d.ctrl[0] = c
        mujoco.mj_step(m, d, n_sub)
        out[k] = d.qpos[0]
    return out


def nominal() -> dict:
    s = DEFAULT.servo
    return {"kp": s.kp, "damping": s.damping, "armature": s.armature, "friction": s.friction, "stall": s.stall_torque}


def synthetic_log(true: dict, seed: int = 0, noise: float = 0.002, rig: Rig = Rig()):
    cmd = schedule(seed)
    q = simulate(true, cmd, rig)
    rng = np.random.default_rng(seed + 1)
    tick = 2 * math.pi / 4096
    meas = np.round((q + rng.normal(0, noise, q.shape)) / tick) * tick
    return cmd, meas


def fit(cmd: np.ndarray, meas: np.ndarray, rig: Rig = Rig(), init: dict | None = None, max_nfev: int = 60) -> dict:
    """Least-squares fit of log-parameters to the measured trajectory."""
    from scipy.optimize import least_squares

    init = init or nominal()
    x0 = np.log([init[k] for k in PARAMS])

    def resid(x):
        theta = dict(zip(PARAMS, np.exp(x)))
        return simulate(theta, cmd, rig) - meas

    res = least_squares(resid, x0, x_scale=1.0, diff_step=0.02, max_nfev=max_nfev, method="trf")
    theta = dict(zip(PARAMS, np.exp(res.x)))
    theta["rmse_rad"] = float(np.sqrt(np.mean(res.fun ** 2)))
    return theta

"""Benchmark v1: MuJoCo twin-real pairs for one tracking task (model-versus-model, not real-robot data).

Task: a torque-driven pendulum arm (hinge, point-mass payload on a rigid rod) tracks a sinusoidal reference with a PD
law plus gravity feedforward computed from the *nominal* model. Context c = (payload mass, initial angle, initial rate,
reference amplitude, reference frequency, disturbance seed). Outcome R in [0, 1] = 1 - min(1, RMS tracking error / E0).

The twin is the nominal model. The "real" model adds a baseline stochastic disturbance torque (so rho < 1 even with no
omitted physics) plus ONE omitted effect at one of four magnitudes. Effects and their parameter ranges are swept, not
fitted: no datasheet is claimed (see README, Limitations).
"""
import numpy as np
import mujoco

DT = 0.005
STEPS = 600            # 3 s
E0 = 0.30              # rad RMS error that maps to R = 0
L = 0.5                # rod length, m
M_NOM = 1.0            # nominal payload, kg
TAU_MAX = 12.0         # actuator torque limit, N m (twin and real)
KP, KD = 60.0, 9.0
BASE_DIST = 4.0        # N m, std of the baseline OU disturbance in the real model

XML = """
<mujoco model="arm">
  <option timestep="{dt}" gravity="0 0 -9.81" integrator="RK4"/>
  <worldbody>
    <body name="link" pos="0 0 0">
      <joint name="j" type="hinge" axis="0 1 0" damping="{damp}" frictionloss="{fl}" armature="{arm}"/>
      <geom type="capsule" fromto="0 0 0 0 0 -{L}" size="0.02" mass="0.0001"/>
      <geom name="m" type="sphere" pos="0 0 -{L}" size="0.05" mass="{mass}"/>
    </body>
  </worldbody>
  <actuator><motor joint="j" gear="1" ctrllimited="true" ctrlrange="-{tmax} {tmax}"/></actuator>
</mujoco>"""

# (effect, level) -> real-model parameters. Twin: damp 0.05, frictionloss 0, armature 0, delay 0, sensor noise 0, gain 1.
NOMINAL = dict(damp=0.05, fl=0.0, arm=0.0, delay=0, sn=0.0, gain=1.0, mass_err=1.0)
EFFECTS = {
    "friction": [dict(fl=v) for v in (0.5, 1.5, 3.0, 5.0)],              # Coulomb joint friction, N m
    "delay": [dict(delay=v) for v in (2, 4, 8, 12)],                      # command latency, steps of 5 ms
    "sensor": [dict(sn=v) for v in (0.02, 0.05, 0.1, 0.2)],            # angle noise std (rad); rate noise = 10x this /s
    "gain": [dict(gain=v) for v in (0.95, 0.85, 0.7, 0.55)],             # actuator gain shortfall
    "mass": [dict(mass_err=v) for v in (1.05, 1.15, 1.3, 1.5)],          # true payload vs the mass the twin was told
}
PAIRS = [(e, i) for e in EFFECTS for i in range(4)]


def pair_name(p):
    return f"{p[0]}-{p[1]}"


def sample_contexts(n, seed):
    r = np.random.default_rng(seed)
    return np.column_stack([
        r.uniform(0.5, 1.5, n), r.uniform(-0.4, 0.4, n), r.uniform(-1.0, 1.0, n),
        r.uniform(0.2, 0.8, n), r.uniform(0.4, 1.2, n), r.integers(0, 2**31 - 1, n)])


_models = {}


def _model(damp, fl, arm, mass):
    key = (damp, fl, arm, round(mass, 6))
    if key not in _models:
        m = mujoco.MjModel.from_xml_string(XML.format(dt=DT, damp=damp, fl=fl, arm=arm, mass=mass, L=L, tmax=TAU_MAX))
        _models[key] = m
    return _models[key]


def episode(ctx, params=None):
    """Run one episode; params=None is the twin. Returns R in [0, 1]. Deterministic given (ctx, params)."""
    mass, th0, w0, amp, freq, seed = ctx
    real = params is not None
    q = {**NOMINAL, **(params or {})}
    m = _model(q["damp"], q["fl"], q["arm"], mass * q["mass_err"])
    d = mujoco.MjData(m)
    d.qpos[0], d.qvel[0] = th0, w0
    rng = np.random.default_rng(int(seed))
    nstep = STEPS
    ou = np.zeros(nstep)
    if real:
        a = np.exp(-DT / 0.1)                       # OU, time constant 0.1 s
        e = rng.standard_normal(nstep) * BASE_DIST * np.sqrt(1 - a * a)
        x = rng.standard_normal() * BASE_DIST
        for k in range(nstep):
            x = a * x + e[k]
            ou[k] = x
        sn = rng.standard_normal((nstep, 2)) * q["sn"]
    buf = [0.0] * (q["delay"] + 1)
    err2 = 0.0
    for k in range(nstep):
        t = k * DT
        ref = amp * np.sin(2 * np.pi * freq * t)
        dref = amp * 2 * np.pi * freq * np.cos(2 * np.pi * freq * t)
        th, w = d.qpos[0], d.qvel[0]
        if real and q["sn"] > 0:
            th, w = th + sn[k, 0], w + 10.0 * sn[k, 1]
        ff = mass * 9.81 * L * np.sin(ref)           # gravity feedforward at the reference (twin told the true payload)
        u = ff + KP * (ref - th) + KD * (dref - w)
        buf.append(float(np.clip(u, -TAU_MAX, TAU_MAX)))
        cmd = buf.pop(0)
        d.ctrl[0] = cmd * q["gain"]
        d.qfrc_applied[0] = ou[k]
        mujoco.mj_step(m, d)
        err2 += (d.qpos[0] - ref) ** 2
    rms = np.sqrt(err2 / nstep)
    return float(1.0 - min(1.0, rms / E0))

"""Milestone 7a: a second MuJoCo benchmark, an unstable cart-pole (model-versus-model, not real-robot data).

The pendulum task of milestone 3 is stable and tracks a reference. This one is unstable: a PD-plus-cart-feedback law
holds a pole upright on a cart from a random start. Context c = (pole mass, initial pole angle, initial pole rate,
initial cart offset, cart-position setpoint, disturbance seed). Outcome R in [0, 1] = fraction of the 4 s horizon the pole
stays within 0.5 rad of upright and the cart within the 1.0 m track, times 1 - min(1, RMS pole angle / 0.25): a bounded,
partly continuous score (a fall ends the episode and scores the survived fraction only).

The twin is the nominal model; the "real" model adds baseline stochastic push forces (so rho < 1 with no omitted physics)
plus ONE omitted effect at one of four swept magnitudes. Magnitudes are swept, not fitted; no datasheet is claimed.
"""
import numpy as np
import mujoco

DT = 0.005
STEPS = 800            # 4 s
FMAX = 20.0            # cart force limit, N
KTH, KW, KX, KV = 55.0, 9.0, 2.0, 3.0
BASE_PUSH = 1.0        # N, std of the OU push on the cart in the real model
ANG_FALL, TRACK = 0.5, 1.0
RMS0 = 0.25

XML = """
<mujoco model="cartpole">
  <option timestep="{dt}" gravity="0 0 -9.81" integrator="RK4"/>
  <worldbody>
    <body name="cart" pos="0 0 0">
      <joint name="slide" type="slide" axis="1 0 0" damping="{cdamp}" frictionloss="{fl}"/>
      <geom type="box" size="0.1 0.05 0.05" mass="1.0"/>
      <body name="pole" pos="0 0 0">
        <joint name="hinge" type="hinge" axis="0 1 0" damping="0.005"/>
        <geom type="capsule" fromto="0 0 0 0 0 0.5" size="0.02" mass="0.0001"/>
        <geom type="sphere" pos="0 0 0.5" size="0.04" mass="{mass}"/>
      </body>
    </body>
  </worldbody>
  <actuator><motor joint="slide" gear="1" ctrllimited="true" ctrlrange="-{fmax} {fmax}"/></actuator>
</mujoco>"""

NOMINAL = dict(cdamp=0.1, fl=0.0, delay=0, sn=0.0, gain=1.0, mass_err=1.0)
EFFECTS = {
    "friction": [dict(fl=v) for v in (0.5, 1.5, 3.0, 5.0)],              # cart Coulomb friction, N
    "delay": [dict(delay=v) for v in (1, 2, 3, 4)],                       # command latency, steps of 5 ms
    "sensor": [dict(sn=v) for v in (0.005, 0.01, 0.02, 0.04)],         # pole-angle noise std (rad); rate noise 10x /s
    "gain": [dict(gain=v) for v in (0.95, 0.85, 0.7, 0.55)],             # actuator gain shortfall
    "mass": [dict(mass_err=v) for v in (1.1, 1.3, 1.6, 2.0)],            # true pole mass vs the twin's
}
PAIRS = [(e, i) for e in EFFECTS for i in range(4)]


def pair_name(p):
    return f"{p[0]}-{p[1]}"


def sample_contexts(n, seed):
    r = np.random.default_rng(seed)
    return np.column_stack([
        r.uniform(0.05, 0.25, n), r.uniform(-0.15, 0.15, n), r.uniform(-0.5, 0.5, n),
        r.uniform(-0.3, 0.3, n), r.uniform(-0.3, 0.3, n), r.integers(0, 2**31 - 1, n)])


_models = {}


def _model(cdamp, fl, mass):
    key = (cdamp, fl, round(mass, 6))
    if key not in _models:
        _models[key] = mujoco.MjModel.from_xml_string(XML.format(dt=DT, cdamp=cdamp, fl=fl, mass=mass, fmax=FMAX))
    return _models[key]


def episode(ctx, params=None, outcome="score"):
    """One episode; params=None is the twin. outcome="score" returns R in [0, 1]; outcome="cost" (milestone 7c) returns the
    unbounded tracking cost, integral of 100 th^2 + (x - xref)^2 over the full horizon with no early stop. Deterministic given (ctx, params)."""
    mass, th0, w0, x0, xref, seed = ctx
    real = params is not None
    q = {**NOMINAL, **(params or {})}
    m = _model(q["cdamp"], q["fl"], mass * q["mass_err"])
    d = mujoco.MjData(m)
    d.qpos[0], d.qpos[1], d.qvel[1] = x0, th0, w0
    rng = np.random.default_rng(int(seed))
    ou = np.zeros(STEPS)
    sn = np.zeros((STEPS, 2))
    if real:
        a = np.exp(-DT / 0.1)
        e = rng.standard_normal(STEPS) * BASE_PUSH * np.sqrt(1 - a * a)
        x = rng.standard_normal() * BASE_PUSH
        for k in range(STEPS):
            x = a * x + e[k]
            ou[k] = x
        sn = rng.standard_normal((STEPS, 2)) * q["sn"]
    buf = [0.0] * (q["delay"] + 1)
    err2, alive, cost = 0.0, STEPS, 0.0
    for k in range(STEPS):
        pos, th, v, w = d.qpos[0], d.qpos[1], d.qvel[0], d.qvel[1]
        if real and q["sn"] > 0:
            th, w = th + sn[k, 0], w + 10.0 * sn[k, 1]
        u = KTH * th + KW * w + KX * (pos - xref) + KV * v          # pole falls toward +x when th > 0: push the cart under it
        buf.append(float(np.clip(u, -FMAX, FMAX)))
        d.ctrl[0] = buf.pop(0) * q["gain"]
        d.qfrc_applied[0] = ou[k]
        mujoco.mj_step(m, d)
        if outcome == "cost":
            cost += (100.0 * d.qpos[1] ** 2 + (d.qpos[0] - xref) ** 2) * DT
            continue
        err2 += d.qpos[1] ** 2
        if abs(d.qpos[1]) > ANG_FALL or abs(d.qpos[0]) > TRACK:
            alive = k + 1
            break
    if outcome == "cost":
        return float(cost)
    rms = np.sqrt(err2 / alive)
    return float(alive / STEPS * (1.0 - min(1.0, rms / RMS0)))

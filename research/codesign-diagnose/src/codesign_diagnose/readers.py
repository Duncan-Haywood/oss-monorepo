"""Scripted proposers ("readers") that differ only in what they may read about the incumbent design.

All three share one skeleton: 8 Sobol designs, then rounds of 4 proposals made around the best feasible design so far
(ranked by test success, the same score every method sees). They differ in how a proposal is made:

  level 0  score only        Gaussian perturbation of all five parameters; the step halves after two stalled rounds.
  level 1  failure summary   reads the incumbent's training-scene failure counts by mode and whether its trained
                             force hit the finger's strength limit; moves along named directions (stronger finger,
                             grippier pad, lighter finger) chosen by rule.
  level 2  full rollout logs additionally reads each training scene (mass, friction, mode) and the force sweep; works
                             out the grip force the heaviest failed scene needs and sizes the pad and finger to it.

These are rules written by the author, not a language model: they test whether the extra information is usable by a
sensible reader, and they are labelled that way everywhere. Nothing here reads the test scenes' diagnostics.
"""
import numpy as np
from scipy.stats import qmc
from .problem import LB, UB, ASSUMED, finger_stats

G_EFF = 9.81 + 12.0        # gravity plus the peak shake acceleration of the rollout, m/s^2
SPAN = UB - LB


def _u(x): return (np.asarray(x, float) - LB) / SPAN
def _x(u): return LB + np.clip(u, 0, 1) * SPAN


# parameter order: w, t, L, v, s
STRENGTH = np.array([+0.5, +1.0, -0.5, 0.0, 0.0])   # wider, thicker, shorter finger: a higher breaking force
FRICTION = np.array([0.0, 0.0, 0.0, +0.7, +1.0])    # deeper V and more TPU
LIGHT = np.array([-0.5, -0.3, -1.0, 0.0, -0.5])     # less plastic: shorter print


def _step(u, direction, size, rng, noise=0.04):
    return u + size * direction + noise * rng.standard_normal(5)


def _incumbent(recs):
    feas = [r for r in recs if r["feasible"]]
    if feas:
        return max(feas, key=lambda r: (r["success"], -r["cost_usd"]))
    return min(recs, key=lambda r: r["print_min"])


def propose(recs, level, rng, k, sigma):
    inc = _incumbent(recs)
    u = _u(inc["x"])
    out = []
    over = inc["print_min"] > ASSUMED["time_cap_min"] * 0.9
    if level == 0:
        return [u + sigma * rng.standard_normal(5) for _ in range(k)]
    d = inc.get("diag") or {}
    if not inc["feasible"]:
        return [_step(u, LIGHT, rng.uniform(0.2, 0.5), rng) for _ in range(k)]
    modes = d.get("modes", {})
    fails = sum(v for m, v in modes.items() if m != "ok")
    light = 0.5 * LIGHT if over else 0.0
    if fails == 0:       # nothing failed in training: the gap to a perfect test score is generalisation, so explore
        return [u + 0.5 * sigma * rng.standard_normal(5) for _ in range(k)]
    if level == 1:
        if d["force_saturated"]:
            plan = [STRENGTH, FRICTION, STRENGTH + FRICTION, None]
        else:
            plan = [FRICTION, 0.5 * STRENGTH + FRICTION, FRICTION, None]
        for i in range(k):
            dirn = plan[i % len(plan)]
            out.append(u + 0.5 * sigma * rng.standard_normal(5) if dirn is None
                       else _step(u, dirn + light, rng.uniform(0.15, 0.4), rng))
        return out
    # level 2: size the pad and the finger to the heaviest failed training scene
    failed = [s for s in d["scenes"] if s["mode"] != "ok"]
    m_kg = max(s["mass_g"] for s in failed) * 1e-3
    w, t, L, v, s_pad = inc["x"]
    mu = inc["mu"]
    f_req = 1.15 * m_kg * G_EFF / (2.0 * mu)              # per-finger grip force so friction holds the heaviest failure
    sweep_gain = d["sweep"][-1][1] - d["sweep"][0][1]     # does more force help at all?
    props = []
    mu_needed = 1.15 * m_kg * G_EFF / (2.0 * 0.8 * inc["f_max"])        # pad friction that fits within 80% of the break limit
    s_fix = float(np.clip((mu_needed - ASSUMED["mu_pla"]) / ASSUMED["mu_tpu_gain"], 0, 1))
    t_fix = float(np.clip(np.sqrt(f_req * ASSUMED["safety"] * 6 * L * 1e-3 / (ASSUMED["sigma_pa"] * w * 1e-3)) * 1e3, LB[1], UB[1]))
    a = u.copy(); a[4] = _u([0, 0, 0, 0, s_fix])[4]; a[3] = min(1.0, u[3] + 0.2)
    b = u.copy(); b[1] = _u([0, t_fix, 0, 0, 0])[1]
    c = a.copy(); c[1] = b[1]
    props = [a, b, c]
    if sweep_gain <= 0.05:        # more force never helped: friction is the limit, not strength
        props = [a, c, a + 0.1 * rng.standard_normal(5)]
    for i in range(k):
        p = props[i % len(props)] if i < len(props) else u + 0.5 * sigma * rng.standard_normal(5)
        out.append(p + (light + 0.03 * rng.standard_normal(5) if i < len(props) else 0))
    return out


def reader(prob, budget, seed, level, rounds_k=4, n_init=8):
    rng = np.random.default_rng(seed)
    prob.level = level
    recs = [prob.evaluate(_x(u)) for u in qmc.Sobol(5, seed=seed).random(n_init)]
    sigma, stall, best = 0.2, 0, max(r["success"] for r in recs if r["feasible"]) if any(r["feasible"] for r in recs) else -1
    while len(recs) < budget:
        k = min(rounds_k, budget - len(recs))
        new = [prob.evaluate(_x(u)) for u in propose(recs, level, rng, k, sigma)]
        recs += new
        top = max([r["success"] for r in recs if r["feasible"]] or [-1])
        stall = 0 if top > best + 1e-9 else stall + 1
        best = max(best, top)
        if stall >= 2:
            sigma, stall = max(0.05, sigma / 2), 0
    return recs

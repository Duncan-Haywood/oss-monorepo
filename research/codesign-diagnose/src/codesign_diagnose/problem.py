"""The co-design problem: choose five finger parameters; a grasp-force policy is trained per design.

Design vector x = (w, t, L, v, s):
  w  finger width, mm [8, 26]          t  finger thickness, mm [2, 6]      L  finger length, mm [25, 60]
  v  pad V-groove depth, 0 (flat) to 1 (35 degree faces)
  s  TPU pad thickness as a fraction of 2 mm: 0 = bare PLA, 1 = 2 mm of TPU on the pad face

Everything in `ASSUMED` is an assumption, not a measurement or a quoted price.
"""
import math
import numpy as np
from .sim import rollout

NAMES = ["w_mm", "t_mm", "L_mm", "v", "s"]
LB = np.array([8.0, 2.0, 25.0, 0.0, 0.0])
UB = np.array([26.0, 6.0, 60.0, 1.0, 1.0])

ASSUMED = dict(
    pla_g_cc=1.24, fill=0.5, tpu_g_cc=1.2, pla_usd_kg=20.0, tpu_usd_kg=30.0,
    pla_g_h=12.0, tpu_g_h=4.0,            # effective deposition rates incl. travel, for a small part
    mu_pla=0.35, mu_tpu_gain=0.55,         # pad friction = mu_pla + gain * s
    sigma_pa=30e6, safety=1.5,             # bending strength of a printed PLA finger across layers
    time_cap_min=40.0,                     # print time allowed for the pair of fingers
    f_lo=0.5, f_hi=30.0, margin=1.3,                   # grasp force range searched by the policy, N per finger
)


def clip(x):
    return np.clip(np.asarray(x, dtype=float), LB, UB)


def finger_stats(x):
    """Static, free-to-compute properties of the design: mass, cost, print time, breaking force."""
    w, t, L, v, s = clip(x)
    a = ASSUMED
    pla_g = w * t * L * 1e-3 * a["pla_g_cc"] * a["fill"]          # mm^3 -> cc is 1e-3
    tpu_g = w * L * (2.0 * s) * 1e-3 * a["tpu_g_cc"]
    pair_g = 2 * (pla_g + tpu_g)
    minutes = 2 * 60.0 * (pla_g / a["pla_g_h"] + tpu_g / a["tpu_g_h"])
    usd = 2 * (pla_g * a["pla_usd_kg"] + tpu_g * a["tpu_usd_kg"]) / 1000.0
    f_break = a["sigma_pa"] * (w * 1e-3) * (t * 1e-3) ** 2 / (6.0 * L * 1e-3)   # cantilever, tip load
    return dict(mass_g=pair_g, print_min=minutes, cost_usd=usd, f_break_n=f_break,
                mu=a["mu_pla"] + a["mu_tpu_gain"] * s, f_max=min(a["f_hi"], f_break / a["safety"]))


def scenarios(n, seed):
    """n grasp scenes: object kind and size, mass, surface friction, lateral and vertical offsets of the hand."""
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        kind = ("cyl", "sphere", "box")[rng.integers(3)]
        lo, hi = {"cyl": (10, 25), "sphere": (12, 25), "box": (20, 50)}[kind]
        out.append(dict(kind=kind, size=float(rng.uniform(lo, hi)), mass_g=float(np.exp(rng.uniform(np.log(150), np.log(1500)))),
                        mu_obj=float(rng.uniform(0.15, 0.45)), dy_mm=float(rng.uniform(-10, 10)), dz_mm=float(rng.uniform(0, 25))))
    return out


TRAIN = scenarios(12, 1001)   # the policy is tuned on these
TEST = scenarios(40, 2002)    # designs are ranked on these (same for every design)
FRESH = scenarios(100, 3003)  # reported once, for the final designs only


def run_scenes(design, force, scenes):
    return [rollout(design, o, force) for o in scenes]


def success_rate(design, force, scenes):
    return float(np.mean([r["success"] for r in run_scenes(design, force, scenes)]))


def train_policy(design, scenes=None):
    """Tune the one policy parameter, the grasp force F, on the training scenes: 8 log-spaced forces, then 4 more
    around the best; take the smallest force with the highest training success and add a safety margin
    (x ASSUMED['margin'], capped at the finger's allowed maximum). Returns (F, diag) where diag keeps the
    per-scene rollouts at every force tried (the raw material of the diagnostic feedback)."""
    scenes = TRAIN if scenes is None else scenes
    lo, hi = ASSUMED["f_lo"], design["f_max"]
    sweep = {}

    def tried(f):
        sweep[float(f)] = run_scenes(design, f, scenes)
        return float(np.mean([r["success"] for r in sweep[float(f)]]))
    if hi <= lo:
        tried(hi)
        return float(hi), dict(sweep=sweep, scenes=scenes, force=float(hi))
    grid = list(np.geomspace(lo, hi, 8))
    sc = [tried(f) for f in grid]
    k = int(np.argmax(sc))
    cand = [float(f) for f in np.geomspace(grid[max(k - 1, 0)], grid[min(k + 1, 7)], 6)[1:-1]]
    sc2 = [tried(f) for f in cand]
    best = max(zip(sc + sc2, [-f for f in grid + cand]))
    f = min(-best[1] * ASSUMED["margin"], hi)
    if f not in sweep:
        tried(f)
    return float(f), dict(sweep=sweep, scenes=scenes, force=float(f))


def diagnostics(rec, diag, level):
    """What the proposer is allowed to read about one evaluated design, by feedback level.
    0 = nothing beyond the score; 1 = failure summary; 2 = full rollout logs (training scenes only)."""
    if level == 0:
        return {}
    res = diag["sweep"][diag["force"]]
    modes = {}
    for r in res:
        modes[r["mode"]] = modes.get(r["mode"], 0) + 1
    out = dict(train_success=float(np.mean([r["success"] for r in res])), modes=modes,
               force_n=diag["force"], f_max=rec["f_max_n"], force_saturated=bool(diag["force"] >= rec["f_max_n"] * 0.999))
    if level >= 2:
        out["scenes"] = [dict(kind=o["kind"], size=o["size"], mass_g=o["mass_g"], mu_obj=o["mu_obj"], mode=r["mode"], slip_mm=r["slip_mm"])
                         for o, r in zip(diag["scenes"], res)]
        out["sweep"] = sorted((f, float(np.mean([r["success"] for r in rs]))) for f, rs in diag["sweep"].items())
    return out


class Problem:
    """Counts evaluations. evaluate(x) -> record with test success, cost and feasibility."""
    def __init__(self, test=None, level=0):
        self.n_evals = 0
        self.level = level
        self.test = TEST if test is None else test

    def design(self, x):
        x = clip(x)
        st = finger_stats(x)
        return dict(w=x[0], t=x[1], L=x[2], v=x[3], s=x[4], mu=st["mu"], f_max=st["f_max"]), st

    def evaluate(self, x):
        self.n_evals += 1
        x = clip(x)
        d, st = self.design(x)
        feasible = st["print_min"] <= ASSUMED["time_cap_min"]
        rec = dict(x=[float(v) for v in x], feasible=bool(feasible), **{k: float(v) for k, v in st.items()})
        if not feasible:
            rec.update(success=0.0, force_n=None, train_success=None, f_max_n=float(d["f_max"]), diag={})
            return rec
        f, diag = train_policy(d)
        rec.update(force_n=float(f), f_max_n=float(d["f_max"]), success=success_rate(d, f, self.test),
                   train_success=float(np.mean([r["success"] for r in diag["sweep"][diag["force"]]])))
        rec["diag"] = diagnostics(rec, diag, self.level)
        return rec

    def penalised(self, rec):
        """Value to minimise: 1 - success, plus a penalty that grows with the print-time excess."""
        over = max(0.0, rec["print_min"] / ASSUMED["time_cap_min"] - 1.0)
        return 1.0 - rec["success"] + (0.0 if rec["feasible"] else 1.0 + over)

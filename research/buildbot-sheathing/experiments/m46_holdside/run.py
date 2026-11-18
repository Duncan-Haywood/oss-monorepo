"""Milestone 46: hold the H1's right hip roll on the other side at (1.4 m, -0.15 m).

Milestone 45 found the stance caps the right hip roll's margin at 0.0339 N m at H1 (1.4 m, -0.15 m), so a 0.2 N
sensor z error flips it (0.172 mm along the wall). Milestone 32 fixed each hold-set joint's side once per robot
(``SIGNS``). A diagnostic before this run (LOG.md, milestone 46 planned) found the torque-minimising plan at this
pose wants the right hip roll at about -3.8 N m, the other side. Here that one joint's hold side is flipped at
that one pose, and the pose plans with the spec's own 0.1 N m leg preload (its milestone 45 tier is dropped; the
tier at (1.6 m, 0) stays). Everything else is milestone 45's object, unchanged.
A. Per H1 pose: hold-set joints whose torque-minimising side disagrees with the per-robot side; at the pose, the
   right hip roll torque and common leg margin under both sides. B. Spec stack at the pose. C. The H1's worst spec
   stack. D. Milestone 45's section D (worst residual along the wall). E. Hypotheses H181-H186.

M46_SMOKE=1 runs a fast code check (numbers not results); M46_PROCS sets the pool (default 3).
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
if _os.environ.get("M46_SMOKE"):
    _os.environ["M45_SMOKE"] = "1"
import importlib.util
import json
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SMOKE = bool(os.environ.get("M46_SMOKE"))
T0 = time.time()
spec = importlib.util.spec_from_file_location("m45", os.path.join(HERE, "..", "m45_tiered", "run.py"))
R45 = importlib.util.module_from_spec(spec)
sys.modules["m45"] = R45
spec.loader.exec_module(R45)                     # milestone 45's object: M1 with its tiered plan
M1 = R45.M1
R44, R43 = R45.R44, R45.R43
K = ("h1", 1.4, -0.15)
JOINT = "right_hip_roll"
N = "h1"
NAMES = M1.ROB[N][1]
LEGS = M1.ROB[N][2]
HOLD = list(M1.light(N))
J0 = [j for j in HOLD if NAMES[j] == JOINT][0]
I0 = HOLD.index(J0)
SIGNS_FLIP = np.asarray(M1.SIGNS[N], float).copy()
SIGNS_FLIP[I0] = -SIGNS_FLIP[I0]
FLIP = [True]
GQ0 = M1.GQ


class SideGQ:
    """``grf_qp`` with the hold sides swapped at the flipped pose while ``plan`` runs there."""
    def __getattr__(self, a):
        return getattr(GQ0, a)

    def solve(self, c, kind, legs, signs=None, tau_f=0.2, hold_idx=None):
        if FLIP[0] and R45.CUR[0] == K and kind == "hold":
            signs = SIGNS_FLIP
        return GQ0.solve(c, kind, legs, signs, tau_f, hold_idx)


M1.GQ = SideGQ()
SET45 = R45.set_tier


def set_tier(on):
    SET45(on)
    if FLIP[0]:
        R45.TIER.pop(K, None)                    # the spec's own 0.1 N m preload at the flipped pose
    M1.PLANS.clear()


R45.set_tier = set_tier                          # milestone 45's task_D calls it in each worker


def common_margin(key, signs):
    """(right hip roll torque, common leg margin) per window end, zero hose force, exact sensor."""
    r, names, legs = M1.ROB[key[0]]
    q = M1.POSE[key].qpos
    out = []
    for F in (M1.F_HI / 2, M1.F_HI):
        cm = M1.contact(r, q, F, M1.TOOL_KG, np.zeros(3))
        fn, _ = GQ0.solve(cm, "hold", legs, signs, M1.TAUF, hold_idx=HOLD)
        if fn is None:
            out.append(None)
            continue
        tau = cm.tau(fn)
        rows, kap, d = M1.PL.margin_rows(tau, legs, M1.TAUF)
        t, _ = M1.PL.margin_lp(cm, rows, kap, d)
        out.append({"F": F, "tau": float(tau[J0]), "t": t})
    return out


def side_check(key):
    """Hold-set joints whose torque-minimising ('torque' model) side differs from the per-robot side."""
    r, names, legs = M1.ROB[key[0]]
    q = M1.POSE[key].qpos
    s = np.asarray(M1.SIGNS[key[0]], float)
    dis = []
    for F in (M1.F_HI / 2, M1.F_HI):
        cm = M1.contact(r, q, F, M1.TOOL_KG, np.zeros(3))
        fn, _ = GQ0.solve(cm, "torque", legs)
        if fn is None:
            dis.append(None)
            continue
        tau = cm.tau(fn)[HOLD]
        dis.append({names[j]: float(tau[i]) for i, j in enumerate(HOLD) if np.sign(tau[i]) != s[i]})
    both = sorted(set(dis[0] or {}) & set(dis[1] or {})) if None not in dis else None
    return dis, both


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "pose": list(K), "joint": JOINT,
           "signs": [float(x) for x in M1.SIGNS[N]], "signs_flip": [float(x) for x in SIGNS_FLIP]}
    print(f"# Milestone 46: H1 {JOINT} held on the other side at {list(K[1:])}, spec preload {R45.M_SPEC:g} N m")
    print(f"hold set {[NAMES[j] for j in HOLD]}, per-robot sides {M1.SIGNS[N]}, flipped at the pose {SIGNS_FLIP}")
    print("## A1. Hold-set joints whose torque-minimising side disagrees with the per-robot side: pose | 25 N end | "
          "50 N end | at both ends")
    out["A1"] = []
    n_other = 0
    for k in sorted(kk for kk in M1.KEYS if kk[0] == N):
        dis, both = side_check(k)
        f = lambda x: "no plan" if x is None else (", ".join(f"{a} {v:+.2f}" for a, v in x.items()) or "-")  # noqa
        print(f"  {list(k[1:])} | {f(dis[0])} | {f(dis[1])} | {both}")
        out["A1"].append({"pose": list(k[1:]), "ends": dis, "both": both})
        if k != K and both:
            n_other += 1
    out["n_other"] = n_other
    print(f"  other poses with a hold-set joint on the wrong side at both ends: {n_other}")
    print(f"## A2. At {list(K[1:])}, zero hose force, exact sensor: sides | {JOINT} torque (25 N, 50 N) | common margin "
          "(25 N, 50 N)")
    out["A2"] = {}
    for nm, s in (("per-robot", M1.SIGNS[N]), ("flipped", SIGNS_FLIP)):
        c = common_margin(K, s)
        out["A2"][nm] = c
        print(f"  {nm:9s} | " + ", ".join("-" if x is None else f"{x['tau']:+.4f}" for x in c) + " | "
              + ", ".join("-" if x is None else f"{x['t']:.4f}" for x in c))
    print()

    set_tier(True)
    m45 = json.load(open(os.path.join(HERE, "..", "m45_tiered", "results.json")))
    B45 = {(r["case"], tuple(r["pose"])): r["spec"] for r in m45["B"]}
    print("## B. No-hose clean-sheet spec stack at the pose: case | flipped side | squeeze (N) | milestone 45 | change "
          "(points)")
    out["B"] = []
    for c in R44.CASES:
        r = R43.task(("zero", c, K))
        v, o = r["spec"], B45[(c, K[1:])]
        out["B"].append({"case": c, "spec": v, "squeeze": r.get("squeeze"), "m45": o,
                         "n_held": r.get("n_held_spec")})
        print(f"  {c:6s} | " + ("   -  " if v is None else f"{v:.4f}") + " | "
              + ("-" if r.get("squeeze") is None else f"{r['squeeze']:+.2f}") + f" | {o:.4f} | "
              + ("-" if v is None else f"{100 * (v - o):+.2f}"))
    print()

    m43 = json.load(open(os.path.join(HERE, "..", "m43_specstack", "results.json")))
    S43 = {(r["lean"], r["case"], r["robot"], tuple(r["pose"])): r["spec"] for r in m43["rows"]}
    print("## C. H1 worst spec stack over its zero-press poses: case | worst | at | poses with a plan | milestone 45")
    W = {}
    for c in R44.CASES:
        vals = []
        for k in sorted(kk for kk in M1.KEYS if kk[0] == N):
            if k == K:
                v = [r["spec"] for r in out["B"] if r["case"] == c][0]
            elif k in R45.DROPPED:
                v = B45[(c, k[1:])]
            else:
                v = S43[("zero", c, N, k[1:])]
            if v is not None:
                vals.append((v, k[1:]))
        v, at = min(vals)
        W[c] = v
        print(f"  {c:6s} | {v:.4f} | {list(at)} | {len(vals)} | {m45['C'][c]:.4f}")
    out["C"] = W
    print()

    procs = int(os.environ.get("M46_PROCS", "3"))
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resD = pool.map(R45.task_D, [(N, H) for H in R45.HB], chunksize=1)
    out["D"] = resD
    m41 = json.load(open(os.path.join(HERE, "..", "m41_stance0", "results.json")))
    W41 = {x["H"]: x["worst"]["all"]["y"] for x in m41["B"] if x["robot"] == N}
    D45 = {x["H"]: x for x in m45["D"]}
    print("(section D tasks: " + ", ".join(f"H {x['H']:g} {x['s']:.0f} s" for x in resD) + ")")
    print(f"## D. H1 worst residual along the wall (mm), 'braked', |e| {R45.B_E} N, S {R45.S_STAR:g} N: H | all poses | "
          "other poses (milestone 41) | (1.4, -0.15) flipped [flips hold/leg/waist/arm] | (1.6, 0) [flips] | "
          "milestone 45: all, (1.4, -0.15) | cases at the two poses with no plan (milestone 45)")
    chk, WD, WP = 0.0, {}, {}
    s14, s16 = str([1.4, -0.15]), str([1.6, 0.0])
    for x in sorted(resD, key=lambda x: x["H"]):
        a, o = x["worst"]["all"], x["worst"]["other"]
        WD[x["H"]] = a["y"]
        chk = max(chk, abs(round(o["y"], 3) - round(W41[x["H"]], 3)))
        cells = []
        for s in (s14, s16):
            w = x["worst"].get(s)
            WP[(x["H"], s)] = None if w is None else w["y"]
            fl = x["flips"].get(s)
            cells.append("-" if w is None else f"{w['y']:.3f} (phi {w['phi']}) ["
                         + "/".join(str(fl[t]) for t in ("hold", "leg", "waist", "arm")) + "]")
        y45 = D45[x["H"]]
        print(f"  {x['H']:5.1f} | {a['y']:.3f} | {o['y']:.3f} ({W41[x['H']]:.3f}) | " + " | ".join(cells)
              + f" | {y45['worst']['all']['y']:.3f}, {y45['worst'][s14]['y']:.3f} | {x['miss']} of {x['cases']} "
              f"({y45['miss']})")
    out["check_m41"] = chk
    print(f"check: the other poses reproduce milestone 41's H1 worst residual to {chk:.3f} mm (expect 0.000)")
    print()

    print("## E. Hypotheses (registered in LOG.md before this run)")
    E = {}
    a2 = out["A2"]["flipped"]
    E["H181"] = all(x is not None and x["t"] >= R45.M_SPEC / R45.BETA for x in a2)
    print("H181 (full 0.1 N m preload: common margin >= 0.1/0.9 at both ends): "
          + ", ".join("-" if x is None else f"{x['t']:.4f}" for x in a2) + f" -> {'held' if E['H181'] else 'refuted'}")
    lim = {0.0: 0.03, 5.0: 0.03, 20.0: 0.05}
    v14 = {H: WP.get((H, s14)) for H in R45.HB}
    E["H182"] = all(v is not None and v <= lim[H] for H, v in v14.items())
    print("H182 ((1.4, -0.15) at most 0.03 / 0.03 / 0.05 mm at 0 / 5 / 20 N): "
          + ", ".join("-" if v is None else f"{v:.3f}" for v in v14.values()) + f" -> {'held' if E['H182'] else 'refuted'}")
    g5, g20 = WD.get(5.0), WD.get(20.0)
    E["H183"] = g5 is not None and g5 <= 0.03 and (SMOKE or (g20 is not None and g20 <= 0.05))
    print(f"H183 (the H1's worst residual at most 0.03 mm at 5 N and 0.05 mm at 20 N): {g5:.3f}, "
          + ("-" if g20 is None else f"{g20:.3f}") + f" -> {'held' if E['H183'] else 'refuted'}")
    miss = sum(x["miss"] for x in resD)
    E["H184"] = miss <= 24
    print(f"H184 (cases at the two poses with no plan at most milestone 45's 24): {miss} of "
          f"{sum(x['cases'] for x in resD)} -> {'held' if E['H184'] else 'refuted'}")
    bb = [r for r in out["B"] if r["case"] == "braked"][0]
    E["H185"] = bb["spec"] is not None and bb["spec"] >= bb["m45"] - 0.001 - 1e-9
    print(f"H185 ('braked' stack at least milestone 45's {bb['m45']:.4f} minus 0.1 points): "
          + ("-" if bb["spec"] is None else f"{bb['spec']:.4f}") + f" -> {'held' if E['H185'] else 'refuted'}")
    E["H186"] = n_other <= 1
    print(f"H186 (at most one other H1 pose with a hold-set joint on the wrong side at both ends): {n_other} -> "
          f"{'held' if E['H186'] else 'refuted'}")
    out["E"] = E
    if not SMOKE:
        json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

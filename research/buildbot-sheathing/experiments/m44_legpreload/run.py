"""Milestone 44: a per-pose leg preload for the zero-press poses that cannot carry the spec's 0.1 N m.

Milestone 43 found two re-leaned H1 poses, (1.4 m, -0.15 m) and (1.6 m, 0), with a 'hold-min' solution but no spec
plan: the stance allows a leg preload margin of only 0.033 and 0.095 N m at the 50 N window end. Here milestone
43's import (milestone 42's, so M0 and M1 are the objects milestones 41-43 built) gives the zero-press setup M1,
and milestone 38's ``plan`` is called unchanged with a per-pose preload m_k = min(0.1, beta * t_min) in place of
0.1, t_min being the smaller of the two largest leg margins at the window ends (zero hose force, exact sensor).
A. m_k per pose. B. The spec stack at the two poses at beta in {0, 0.25, 0.5, 0.9}. C. The H1's worst spec stack.
D. The worst residual along the wall ('braked', |e| 0.2 N, S 10 N, H 0/5/20 N; milestone 41's section B).
E. Hypotheses H170-H174 (registered in LOG.md before the run).

M44_SMOKE=1 runs a fast code check (numbers not results); M44_PROCS sets the pool (default 4).
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import json
import math
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SMOKE = bool(os.environ.get("M44_SMOKE"))
T0 = time.time()
spec = importlib.util.spec_from_file_location("m43", os.path.join(HERE, "..", "m43_specstack", "run.py"))
R43 = importlib.util.module_from_spec(spec)
sys.modules["m43"] = R43
spec.loader.exec_module(R43)                     # builds M0 and M1 as milestone 43 did; its __main__ does not run
M0, M1, A = R43.M0, R43.M1, R43.A

M_SPEC = M1.M_LEG                                # milestone 37's 0.1 N m
BETA = 0.9                                       # the registered back-off
BETAS = [0.0, 0.25, 0.5, 0.9]
DROPPED = [("h1", 1.4, -0.15), ("h1", 1.6, 0.0)]
S_STAR = R43.S_STAR
B_E = 0.2
HB = [0.0, 5.0] if SMOKE else [0.0, 5.0, 20.0]
CASES = R43.CASES


def t_min(key):
    """Smaller of the largest leg margins at the two window ends (zero hose force, exact sensor), or None."""
    n = key[0]
    r, names, legs = M1.ROB[n]
    q = M1.POSE[key].qpos
    ts = []
    for F in (M1.F_HI / 2, M1.F_HI):
        cm = M1.contact(r, q, F, M1.TOOL_KG, np.zeros(3))
        fn, _ = M1.GQ.solve(cm, "hold", legs, M1.SIGNS[n], M1.TAUF, hold_idx=M1.light(n))
        if fn is None:
            return None
        rows, kap, d = M1.PL.margin_rows(cm.tau(fn), legs, M1.TAUF)
        t, _ = M1.PL.margin_lp(cm, rows, kap, d)
        if t is None:
            return None
        ts.append(t)
    return min(ts)


TMIN = {k: t_min(k) for k in sorted(M1.KEYS)}
MLEG = {}
ORIG_PLAN = M1.plan


def plan_pp(key, f, e, S):
    """Milestone 38's ``plan`` with the leg preload m_k at this pose (0.1 N m wherever the stance allows it)."""
    M1.M_LEG = MLEG.get(key, M_SPEC)
    try:
        return ORIG_PLAN(key, f, e, S)
    finally:
        M1.M_LEG = M_SPEC


M1.plan = plan_pp                                # residuals() and joint_err() look ``plan`` up in M1's globals


def set_beta(beta):
    MLEG.clear()
    for k, t in TMIN.items():
        if t is not None and beta * t < M_SPEC:
            MLEG[k] = beta * t
    M1.PLANS.clear()                             # the plan cache is keyed without the preload


def task_D(args):
    n, H = args
    set_beta(BETA)
    M1.GAPR = R43.gaps(M1, n, "braked")
    t1 = time.time()
    best = {"all": None, "two": None, "other": None}
    miss, cases = 0, 0
    for i in M1.phis_for(H):
        phi = M1.PHIS[i] if H > 0 else 0.0
        for a in M1.AXES:
            e = B_E * a
            rg = M1.residuals(n, H, phi, e, S_STAR)
            for k in DROPPED:
                if k[0] == n:
                    cases += 1
                    miss += k not in rg
            for key, mu in rg.items():
                y = abs(mu["y"][0]) / M1.MM
                for g in ("all", "two" if key in DROPPED else "other"):
                    if best[g] is None or y > best[g]["y"]:
                        best[g] = {"y": y, "at": list(key[1:]), "phi": round(math.degrees(phi))}
    return {"robot": n, "H": H, "worst": best, "miss": miss, "cases": cases, "s": time.time() - t1}


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "m_spec": M_SPEC, "beta": BETA, "betas": BETAS,
           "S": S_STAR, "b": B_E, "H": HB}
    print(f"# Milestone 44: a per-pose leg preload m_k = min({M_SPEC:g}, beta t_min) on the zero-press poses")
    set_beta(BETA)
    print(f"## A. Poses whose stance cannot carry {M_SPEC:g} N m with beta {BETA:g}: robot | pose | t_min (N m) | m_k (N m)")
    for k in sorted(MLEG):
        print(f"  {k[0]} {list(k[1:])} | {TMIN[k]:.4f} | {MLEG[k]:.4f}")
    out["A"] = [{"robot": k[0], "pose": list(k[1:]), "t_min": TMIN[k], "m": MLEG[k]} for k in sorted(MLEG)]
    out["changed"] = sorted(MLEG) == sorted(DROPPED)
    print(f"  (changed poses are exactly milestone 43's two dropped poses: {out['changed']})")
    print()

    m43 = json.load(open(os.path.join(HERE, "..", "m43_specstack", "results.json")))
    S43 = {(r["lean"], r["case"], r["robot"], tuple(r["pose"])): r for r in m43["rows"]}
    print("## B. No-hose clean-sheet stack at the two poses: robot | pose | case | beta | m_k (N m) | spec stack | "
          "squeeze (N) | change vs milestone 40 old-lean spec (points) | 'hold-min' (zero-press lean)")
    out["B"] = []
    for beta in BETAS:
        set_beta(beta)
        for k in DROPPED:
            for c in CASES:
                r = R43.task(("zero", c, k))
                old = S43[("m32", c, k[0], k[1:])]["spec"]
                v = r["spec"]
                out["B"].append({"robot": k[0], "pose": list(k[1:]), "case": c, "beta": beta,
                                 "m": MLEG.get(k, M_SPEC), "spec": v, "squeeze": r.get("squeeze"),
                                 "old": old, "holdmin": r["holdmin"]})
                print(f"  {k[0]} {list(k[1:])} | {c:6s} | {beta:4.2f} | {MLEG.get(k, M_SPEC):.4f} | "
                      + ("   -  " if v is None else f"{v:.4f}") + " | "
                      + ("-" if r.get("squeeze") is None else f"{r['squeeze']:+.2f}") + " | "
                      + ("-" if v is None else f"{100 * (v - old):+.2f}") + f" | {r['holdmin']:.4f}")
    print()

    set_beta(BETA)
    print(f"## C. H1 worst spec stack over its zero-press poses (beta {BETA:g}): case | worst | at | poses with a plan | "
          "milestone 43 (fixed 0.1 N m)")
    W = {}
    for c in CASES:
        vals = []
        for k in sorted(kk for kk in M1.KEYS if kk[0] == "h1"):
            v = (R43.task(("zero", c, k))["spec"] if k in DROPPED
                 else S43[("zero", c, "h1", k[1:])]["spec"])
            if v is not None:
                vals.append((v, k[1:]))
        v, at = min(vals)
        W[c] = v
        w43 = [x for x in m43["worst"] if x["robot"] == "h1" and x["case"] == c and x["lean"] == "zero"][0]
        print(f"  {c:6s} | {v:.4f} | {list(at)} | {len(vals)} | {w43['stack']:.4f} at {w43['at']}")
    out["C"] = W
    print()

    procs = int(os.environ.get("M44_PROCS", "4"))
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resD = pool.map(task_D, [("h1", H) for H in HB], chunksize=1)
    out["D"] = resD
    m41 = json.load(open(os.path.join(HERE, "..", "m41_stance0", "results.json")))
    W41 = {x["H"]: x["worst"]["all"]["y"] for x in m41["B"] if x["robot"] == "h1"}
    print("(section D tasks: " + ", ".join(f"H {x['H']:g} {x['s']:.0f} s" for x in resD) + ")")
    print(f"## D. H1 worst residual along the wall (mm), 'braked', |e| {B_E} N, S {S_STAR:g} N, beta {BETA:g}: H | all "
          "poses | other poses (milestone 41, all poses) | the two poses (where, phi) | cases at the two poses with no plan")
    chk, WD = 0.0, {}
    for x in sorted(resD, key=lambda x: x["H"]):
        a, o, t = x["worst"]["all"], x["worst"]["other"], x["worst"]["two"]
        WD[x["H"]] = a["y"]
        chk = max(chk, abs(round(o["y"], 3) - round(W41[x["H"]], 3)))
        print(f"  {x['H']:5.1f} | {a['y']:.3f} | {o['y']:.3f} ({W41[x['H']]:.3f}) | "
              + (f"{t['y']:.3f} at {t['at']} phi {t['phi']}" if t else "-") + f" | {x['miss']} of {x['cases']}")
    out["check_m41"] = chk
    print(f"check: the other poses reproduce milestone 41's H1 worst residual to {chk:.3f} mm (expect 0.000)")
    print()

    print("## E. Hypotheses (registered in LOG.md before this run)")
    E = {}
    b9 = [r for r in out["B"] if r["beta"] == BETA]
    E["H170"] = all(r["spec"] is not None for r in b9)
    print(f"H170 (beta 0.9: both poses have a spec plan at zero hose force): "
          f"{sum(r['spec'] is not None for r in b9)} of {len(b9)} pose-cases -> {'held' if E['H170'] else 'refuted'}")
    miss = sum(x["miss"] for x in resD)
    E["H171"] = miss == 0
    print(f"H171 (both poses keep a plan in every swept case): {miss} of {sum(x['cases'] for x in resD)} cases "
          f"have none -> {'held' if E['H171'] else 'refuted'}")
    bb = [r for r in b9 if r["case"] == "braked"]
    loss = [100 * (r["old"] - r["spec"]) if r["spec"] is not None else float("inf") for r in bb]
    E["H172"] = max(loss) <= 0.5
    print(f"H172 ('braked': each pose within 0.5 points of its old-lean spec stack): losses "
          + ", ".join(f"{v:+.2f}" for v in loss) + f" -> {'held' if E['H172'] else 'refuted'}")
    E["H173"] = W["braked"] >= 0.9600 - 1e-12
    print(f"H173 ('braked': the H1's worst spec stack at least 0.9600): {W['braked']:.4f} -> "
          f"{'held' if E['H173'] else 'refuted'}")
    g5, g20 = WD.get(5.0), WD.get(20.0)
    E["H174"] = g5 is not None and g5 <= 0.03 and (SMOKE or (g20 is not None and g20 <= 0.05))
    print(f"H174 (the H1's worst residual at most 0.03 mm at 5 N and 0.05 mm at 20 N): {g5:.3f}, "
          + ("-" if g20 is None else f"{g20:.3f}") + f" -> {'held' if E['H174'] else 'refuted'}")
    out["E"] = E
    if not SMOKE:
        json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

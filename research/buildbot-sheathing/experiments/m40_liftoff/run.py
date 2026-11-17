"""Milestone 40: the recoil's lift-off and the re-press from zero (milestones 30-39 scored loose joints uniform).

Milestone 39's spec (S* = 10 N squeeze, m = 0.1 N m leg preload, settle model, rubber hose, k_t 1e4, one
calibration at milestone 30's pose in the same hose state and sensor error), imported from
``../m39_waist/run.py`` (which imports milestone 38's), waist cases 'stock' and 'braked'. New: the press rises
quasi-statically from a release force F_r to the 25-50 N window, sampled every 5 N below 25 N with the same
controller (hold QP plus leg preload at each F; the hold QP alone where the preload has no solution; the
window's squeeze). A joint below tau_f over the window is *set* by the last sample on the rise where it
reaches tau_f (``liftoff``).

0. The recoil bracket from published measurements. A. Census (H 0, exact sensor): nose-moving loose joints
and how many the re-press sets, F_r 0 and 10 N. B. Worst residual along the wall, |e| 0.2 N, H 0, 5, 20 N,
F_r 0, compensator 'uniform' (milestone 39, no lift-off), 'unaware' (lift-off, milestone 39's compensator)
and 'aware' (predicts the set sides from its plan). D. No-hose clean-sheet stack per pose: loose joints
uniform against set joints carrying no random part. E. Hypotheses H151-H155 (registered in LOG.md).
M40_SMOKE=1 runs a fast code check (numbers not results); M40_PROCS sets the pool (default 4).
"""
import importlib.util
import json
import math
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SMOKE = bool(os.environ.get("M40_SMOKE"))
if SMOKE:
    os.environ["M39_SMOKE"] = "1"
spec = importlib.util.spec_from_file_location("m39", os.path.join(HERE, "..", "m39_waist", "run.py"))
W39 = importlib.util.module_from_spec(spec)
sys.modules["m39"] = W39
print("(milestone 39's setup, imported:)")
spec.loader.exec_module(W39)
print()
M = W39.M                                        # milestone 38's module: poses, plans, residual machinery
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import liftoff as LO  # noqa: E402

T0 = time.time()
S_STAR = W39.S_STAR
TAUF = M.TAUF
F_LO = M.F_HI / 2
STEP = 5.0
CASES = ["stock", "braked"]
COMPS = ["uniform", "unaware", "aware"]
FRS = [0.0, 10.0]
HB = [0.0, 5.0] if SMOKE else [0.0, 5.0, 20.0]
B_E = 0.2
FALLBACK = {"preload": 0, "hold": 0, "none": 0, "skipped": 0}


# Post hoc (the smoke run, before the full run): a leaned pose balances only over its press window, and the
# G1's poses at z >= 1.0 m (milestone 30's calibration pose among them) and the H1's at 1.4-1.6 m fall towards the
# wall below 4-12 N. Below that force the stance does not exist (the robot would have to re-lean or step, which
# is outside the model), so the rise starts at max(F_r, the pose's lowest balancing force).
FBAL = {key: M.GQ.press_window(M.ROB[key[0]][0], M.POSE[key].qpos, M.TOOL_KG, M.TT, M.MU, M.F_MID)[0]
        for key in M.KEYS}


def path_forces(fr, key=None):
    f0 = fr if key is None else max(fr, FBAL[key] + 1e-3 if FBAL[key] > 0 else 0.0)
    return [f0] + [F for F in np.arange(0.0, F_LO - 1e-9, STEP) if F > f0 + 1e-9]


def plan_path(key, f, e, fr):
    """(actual, planned) torque lists on the rise from fr to the window, with the window plan's squeeze s;
    None when the window has no plan. Each sample uses the hold QP plus the leg preload, or the hold QP alone,
    or the leg-torque QP; a sample where none balances is skipped (the stance does not exist there); each
    fallback is counted."""
    p = M.plan(key, f, e, S_STAR)
    if p is None:
        return None
    n = key[0]
    r, names, legs = M.ROB[n]
    q = M.POSE[key].qpos
    a, s = M.SQA[key], p[2]
    ta, tp = [], []
    for F in path_forces(fr, key):
        cm = M.contact(r, q, F, M.TOOL_KG, np.asarray(f, float) + np.asarray(e, float))
        fn, _ = M.GQ.solve(cm, "hold", legs, M.SIGNS[n], TAUF, hold_idx=M.light(n))
        if fn is not None:
            rows, kap, d = M.PL.margin_rows(cm.tau(fn), legs, TAUF)
            fm = M.PL.solve_margin(cm, legs, rows, kap, d, M.M_LEG)
            if fm is not None:
                fn = fm
                FALLBACK["preload"] += 1
            else:
                FALLBACK["hold"] += 1
        else:
            fn, _ = M.GQ.solve(cm, "torque", legs, None, TAUF)
            FALLBACK["none"] += 1
            if fn is None:                       # the stance does not balance at this F under this load: the
                FALLBACK["skipped"] += 1         # rise starts above it (hose and sensor error shift the window)
                continue
        ct = M.contact(r, q, F, M.TOOL_KG, np.asarray(f, float))
        tp.append(cm.tau(fn) + a * s)
        ta.append(ct.tau(M.PL.settle(ct, fn)) + a * s)
    return ta, tp, p


def joint_err(key, f, e, gap, comp, fr=0.0):
    pp = plan_path(key, f, e, fr) if comp != "uniform" else None
    p = M.plan(key, f, e, S_STAR)
    if p is None or (comp != "uniform" and pp is None):
        return None
    ta, tp = p[0], p[1]
    err = M.FT.joint_error(ta, tp, M.TQ[key], TAUF, gap, M.KREG, 0.0)
    if comp in ("unaware", "aware"):
        err = err + LO.lift_bias(pp[0], ta[0], ta[1], TAUF, gap)
    if comp == "aware":
        err = err - LO.lift_bias(pp[1], tp[0], tp[1], TAUF, gap)
    return err


def residuals(n, H, phi, e, case, comp):
    g = W39.gaps(n, case)
    ref = (n,) + M.REF
    er = joint_err(ref, M.hose_f(ref, H, phi), e, g, comp)
    if er is None:
        return {}
    res = {}
    for key in [k for k in M.KEYS if k[0] == n]:
        ep = joint_err(key, M.hose_f(key, H, phi), e, g, comp)
        if ep is not None:
            res[key] = M.C.compensated(M.POSE[key].rows[:2], M.POSE[ref].rows[:2], ep, er, M.L0)
    return res


def task_A(args):
    n, fr = args
    rows = []
    for key in [k for k in M.KEYS if k[0] == n]:
        p = M.plan(key, np.zeros(3), np.zeros(3), S_STAR)
        if p is None:
            continue
        pp = plan_path(key, np.zeros(3), np.zeros(3), fr)
        ta = p[0]
        held = M.B.held(ta[0], ta[1], TAUF)
        mov = M.POSE[key].rows[2]
        loose = (~held) & mov
        st = ((LO.set_sign(pp[0], ta[0], ta[1], TAUF) != 0) if pp is not None else np.zeros(len(mov), bool)) & mov
        for j in np.flatnonzero(loose):
            rows.append({"pose": list(key[1:]), "joint": M.ROB[n][1][j], "kind": M.kind(n, j),
                         "below": bool(LO.below(ta[0][j:j + 1], ta[1][j:j + 1], TAUF)[0]), "set": bool(st[j]),
                         "tau_window": [float(ta[0][j]), float(ta[1][j])],
                         "tau_path": [float(t[j]) for t in pp[0]] if pp is not None else None})
    return {"n": n, "fr": fr, "rows": rows, "no_path": [list(k[1:]) for k in M.KEYS if k[0] == n
                                                          and plan_path(k, np.zeros(3), np.zeros(3), fr) is None]}


def task_B(args):
    n, case, comp = args
    t1 = time.time()
    out = []
    for H in HB:
        best = None
        for i in M.phis_for(H):
            phi = M.PHIS[i] if H > 0 else 0.0
            for ax in M.AXES:
                e = B_E * ax
                for key, mu in residuals(n, H, phi, e, case, comp).items():
                    if best is None or abs(mu["y"][0]) > abs(best["y"]):
                        best = {"y": mu["y"][0], "z": mu["z"][0], "at": list(key[1:]), "phi": round(math.degrees(phi)),
                                "e": [float(x) for x in e]}
        out.append({"robot": n, "case": case, "comp": comp, "H": H, "worst": best})
    return {"rows": out, "s": time.time() - t1, "fallback": dict(FALLBACK)}


def task_D(args):
    n, case = args
    g = W39.gaps(n, case)
    rows = []
    for key in [k for k in M.KEYS if k[0] == n]:
        pp = plan_path(key, np.zeros(3), np.zeros(3), 0.0)
        if pp is None:
            continue
        ta = pp[2][0]
        held = M.B.held(ta[0], ta[1], TAUF)
        q = M.T.quant_sigma(12)
        jp, jr = M.POSE[key].rows[:2]
        v_u = M.stack(M.B.from_rows(jp, jr, M.B.joint_sigmas(q, g, ~held), M.L0))
        v_s = M.stack(M.B.from_rows(jp, jr, M.B.joint_sigmas(q, g, LO.still_loose(pp[0], ta[0], ta[1], TAUF, held)),
                                    M.L0))
        rows.append({"robot": n, "case": case, "pose": list(key[1:]), "uniform": v_u, "set": v_s,
                     "m39_convention": M.V(key) if case == "stock" else None})
    return rows


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M.mujoco.__version__}, "S": S_STAR, "m_leg": M.M_LEG, "tau_f": TAUF,
           "step": STEP, "F_r": FRS, "H": HB, "b": B_E, "cases": CASES, "comps": COMPS}
    print("# Milestone 40: the recoil's lift-off and the re-press from zero")
    lo, hi, parts = LO.recoil_bracket()
    out["recoil"] = {"nail_g": 1e3 * LO.nail_mass(), "low": lo, "high": hi, "parts": parts}
    print(f"## 0. Recoil bracket: 8d shank {1e3 * LO.nail_mass():.2f} g; nail momentum "
          f"{parts['nail_pd1975'][0]:.3f}-{parts['nail_pd1975'][1]:.3f} N s (Peterson and Dixon 1975), "
          f"{parts['nail_chrono'][0]:.3f}-{parts['nail_chrono'][1]:.3f} N s (Buchalter et al. 2002); "
          f"Lowe et al. 2014 force-plate unloading {hi:.2f} N s per transfer phase")
    print(f"   bracket {lo:.3f}-{hi:.2f} N s against buildbot-recoil's lift-off band 0.25-1 N s: "
          f"{'straddles it' if lo < 0.25 and hi > 1.0 else 'does not straddle it'}")
    print()

    out["F_bal"] = {f"{k[0]} {k[1]} {k[2]}": FBAL[k] for k in M.KEYS}
    for n in M.ROB:
        hi = sorted({(k[1], round(FBAL[k], 1)) for k in M.KEYS if k[0] == n and FBAL[k] > 0})
        print(f"{n}: lowest balancing press > 0 at " + (", ".join(f"z {z:g} m {f:g} N" for z, f in hi) or "no pose")
              + f" (milestone 30's calibration pose {FBAL[(n,) + M.REF]:.1f} N)")
    print()

    procs = int(os.environ.get("M40_PROCS", "4"))
    ctx = M.mp.get_context("fork")
    with ctx.Pool(procs) as pool:
        resA = pool.map(task_A, [(n, fr) for fr in FRS for n in M.ROB], chunksize=1)
    out["A"] = resA
    print("## A. Census, H 0, exact sensor, window plan of the spec: nose-moving joints loose in the window "
          "(of which below tau_f at both ends), set by the re-press, by kind")
    census = {}
    for x in resA:
        rows = x["rows"]
        by = {}
        for r in rows:
            k = by.setdefault(r["kind"], [0, 0, 0])
            k[0] += 1
            k[1] += r["below"]
            k[2] += r["set"]
        tot = [sum(v[i] for v in by.values()) for i in range(3)]
        census[(x["n"], x["fr"])] = tot
        peaks = [max(abs(t) for t in r["tau_path"]) for r in rows if r["below"] and r["tau_path"]]
        if peaks:
            print(f"  ({x['n']} F_r {x['fr']:g}: largest |tau| on the rise of a joint below tau_f in the window "
                  f"{max(peaks):.3f} N m; tau_f would have to be below that for the re-press to set one)")
        if x["no_path"]:
            print(f"  ({x['n']} F_r {x['fr']:g}: no rise plan at {x['no_path']})")
        print(f"  {x['n']} F_r {x['fr']:4.1f} N: loose {tot[0]} (below {tot[1]}), set {tot[2]}; "
              + "; ".join(f"{k} {v[0]}/{v[1]}/{v[2]}" for k, v in sorted(by.items())))
    print()

    jobs = [(n, c, cp) for n in ("g1", "h1") for c in CASES for cp in COMPS]
    with ctx.Pool(procs) as pool:
        resB = pool.map(task_B, jobs, chunksize=1)
    out["B"] = [r for x in resB for r in x["rows"]]
    out["fallback_B"] = [x["fallback"] for x in resB]
    print("(section B tasks: " + ", ".join(f"{j[0]} {j[1]} {j[2]} {x['s']:.0f} s" for j, x in zip(jobs, resB)) + ")")
    print("(rise samples per controller, summed over section B processes: "
          + json.dumps({k: sum(x["fallback"][k] for x in resB) for k in FALLBACK}) + ")")

    def wB(n, c, cp, H):
        w = [r for r in out["B"] if r["robot"] == n and r["case"] == c and r["comp"] == cp and r["H"] == H][0]["worst"]
        return None if w is None else abs(w["y"]) / M.MM

    m39 = json.load(open(os.path.join(HERE, "..", "m39_waist", "results.json")))
    print(f"## B. Worst residual along the wall (mm), |e| {B_E} N, F_r 0: robot | case | H | uniform / unaware / "
          "aware   (milestone 39)")
    out["check_uniform"] = 0.0
    for n in M.ROB:
        for c in CASES:
            for H in HB:
                v = [wB(n, c, cp, H) for cp in COMPS]
                ref = [r for r in m39["B"] if r["robot"] == n and r["case"] == c and r["H"] == H and r["b"] == B_E]
                rv = abs(ref[0]["worst"]["y"]) / M.MM if ref and ref[0]["worst"] else None
                if rv is not None and v[0] is not None:
                    out["check_uniform"] = max(out["check_uniform"], abs(v[0] - rv))
                print(f"  {n} {c:6s} {H:5.1f} | " + " / ".join("none" if x is None else f"{x:.3f}" for x in v)
                      + f"   ({'-' if rv is None else f'{rv:.3f}'})")
    print(f"check: 'uniform' reproduces milestone 39 to {out['check_uniform']:.1e} mm (expect 0)")
    print()

    with ctx.Pool(procs) as pool:
        resD = pool.map(task_D, [(n, c) for n in ("g1", "h1") for c in CASES], chunksize=1)
    out["D"] = [r for x in resD for r in x]
    print("## D. No-hose clean-sheet stack per pose (spec window torques): robot | case | worst pose | "
          "uniform loose | set joints fixed | gain (points); min over poses")
    gains = {}
    for n in M.ROB:
        for c in CASES:
            rows = [r for r in out["D"] if r["robot"] == n and r["case"] == c]
            if not rows:
                continue
            w = min(rows, key=lambda r: r["uniform"])
            gains[(n, c)] = 100 * (w["set"] - w["uniform"])
            print(f"  {n} {c:6s} | {w['pose']} | {w['uniform']:.4f} | {w['set']:.4f} | {gains[(n, c)]:+.2f}; "
                  f"min over poses {min(r['uniform'] for r in rows):.4f} -> {min(r['set'] for r in rows):.4f}"
                  + (f"; milestone 39's convention at that pose {w['m39_convention']:.4f}" if w["m39_convention"]
                     else ""))
    print()

    print("## E. Hypotheses (registered in LOG.md before this run)")
    E = {}
    tot0 = [sum(census[(n, 0.0)][i] for n in M.ROB) for i in range(3)]
    tot10 = sum(census[(n, 10.0)][2] for n in M.ROB)
    E["H151"] = tot0[0] > 0 and tot0[2] >= 0.5 * tot0[0]
    print(f"H151 (F_r 0 sets at least half the loose nose-moving joints): {tot0[2]} of {tot0[0]} -> "
          f"{'held' if E['H151'] else 'refuted'}")
    try:
        u, a = wB("g1", "braked", "unaware", 5.0), wB("g1", "braked", "aware", 5.0)
        E["H152"] = u > 0.1
        print(f"H152 (braked, 5 N, unaware > 0.1 mm; milestone 39 0.012): {u:.3f} mm -> "
              f"{'held' if E['H152'] else 'refuted'}")
        E["H153"] = a <= 0.1
        print(f"H153 (braked, 5 N, aware <= 0.1 mm): {a:.3f} mm -> {'held' if E['H153'] else 'refuted'}")
    except (IndexError, TypeError):
        print("H152-H153: cells missing")
    if ("g1", "braked") in gains:
        E["H154"] = gains[("g1", "braked")] >= 0.5
        print(f"H154 (braked, G1 worst pose stack gains >= 0.5 points): {gains[('g1', 'braked')]:+.2f} -> "
              f"{'held' if E['H154'] else 'refuted'}")
    E["H155"] = tot10 < tot0[2]
    print(f"H155 (F_r 10 sets fewer than F_r 0): {tot10} vs {tot0[2]} -> {'held' if E['H155'] else 'refuted'}")
    out["E"] = E
    if not SMOKE:
        json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(f"\n(run time {time.time() - T0:.0f} s after the import; python {platform.python_version()}, "
          f"numpy {np.__version__}, mujoco {M.mujoco.__version__})")

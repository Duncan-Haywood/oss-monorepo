"""Milestone 41: a stance that stands at zero press, and what it costs in the press window.

Milestone 40 found that 12 of milestone 32's 35 leaned poses balance only above a press of 3.7-11.8 N: a nailer
whose recoil lifts the nose leaves them leaning on nothing. Here each pose whose balancing window does not reach
0 N is re-leaned to the furthest-forward lean (``com_dx``, the balanced centre of mass ahead of the feet centre)
that still stands at zero press, found by bisection between 0 and its milestone 32 lean (``stance0``). Every
other pose keeps its lean.

A. Per pose: milestone 32's lean and window, the re-lean and its window, and whether it covers 0-50 N; an
analytic check of the window's width (m g sole length / grip height). B. Milestone 38's setup rebuilt on the
re-leaned pose set (its import runs again with ``grf_qp.leaned_pose`` returning the re-leaned pose; every
plan, controller side choice and calibration is recomputed), milestone 39's 'braked' waist, |e| 0.2 N, H 0, 5
and 20 N: worst residual along the wall over all poses and over the re-leaned ones. C. The no-hose clean-sheet
stack per pose ('braked') against milestone 40's. D. Hypotheses H156-H160 (registered in LOG.md before the run).

M41_SMOKE=1 runs a fast code check (numbers not results); M41_PROCS sets the pool (default 4).
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
ROOT = os.path.join(HERE, "..", "..")
SMOKE = bool(os.environ.get("M41_SMOKE"))
if SMOKE:
    os.environ["M38_SMOKE"] = "1"
sys.path[:0] = [os.path.join(ROOT, "src"), os.path.join(ROOT, "..", "buildbot-payload", "src"),
                os.path.join(ROOT, "..", "buildbot-fasten", "src")]
from buildbot_sheathing import grf_qp as GQ  # noqa: E402  (the same module object milestone 38's run imports)
from buildbot_sheathing import stance0 as S0  # noqa: E402
from buildbot_sheathing import waist as WA  # noqa: E402

ORIG_LEAN = GQ.leaned_pose
DX0 = {}                                          # (robot name, z, dy) -> milestone 32's lean, recorded
LEAN = {}                                         # (robot name, z, dy) -> (re-leaned pose, dx), set in part A
TAG = {}


def recording(robot, data0, hand_xz, tool_kg, press, t, dy=0.0, iters=6):
    p, dx, cx = ORIG_LEAN(robot, data0, hand_xz, tool_kg, press, t, dy=dy, iters=iters)
    DX0[(TAG[id(robot)], hand_xz[1], dy)] = dx
    return p, dx, cx


def releaned(robot, data0, hand_xz, tool_kg, press, t, dy=0.0, iters=6):
    k = (TAG[id(robot)], hand_xz[1], dy)
    if k in LEAN:
        p, dx = LEAN[k]
        return p, dx, None
    return ORIG_LEAN(robot, data0, hand_xz, tool_kg, press, t, dy=dy, iters=iters)


def load(name, wrapper):
    """Exec milestone 38's run.py as module ``name`` with ``grf_qp.leaned_pose`` replaced by ``wrapper``."""
    from buildbot_payload import model as P
    orig_load = P.load

    def tagged(n):
        r = orig_load(n)
        TAG[id(r)] = n
        return r
    P.load, GQ.leaned_pose = tagged, wrapper
    try:
        spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", "m38_squeeze", "run.py"))
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)
    finally:
        P.load, GQ.leaned_pose = orig_load, ORIG_LEAN
    return mod


T0 = time.time()
print("(milestone 38's setup, imported with milestone 32's leans recorded:)")
M0 = load("m38", recording)
print()
P = sys.modules["buildbot_payload.model"]
F_HI = M0.F_HI
BRAKED_E = 0.2
HB = [0.0, 5.0] if SMOKE else [0.0, 5.0, 20.0]


def window(r, q, start):
    return GQ.press_window(r, q, M0.TOOL_KG, M0.TT, M0.MU, start)


def sole_len(r, q):
    import mujoco
    d = mujoco.MjData(r.model)
    d.qpos[:] = q
    mujoco.mj_forward(r.model, d)
    xs = [p[0] for _, p in GQ.contact_points(r.model, d, r)]
    return max(xs) - min(xs)


def part_A():
    rows = []
    for key in sorted(M0.POSE):
        n, z, dy = key
        r = M0.ROB[n][0]
        d0 = P.standing(r)
        w0 = window(r, M0.POSE[key].qpos, M0.F_MID)
        row = {"robot": n, "z": z, "dy": dy, "dx0": DX0[key], "w0": list(w0), "relean": False,
               "in_m38": key in M0.KEYS, "grip": M0.GRIP[key]}
        if w0[0] > 0:
            def stands0(dx):
                p = P.pose(r, d0, (M0.X, z), M0.TOOL_KG, "palm", com_dx=dx, dy=dy)
                return p.ok and window(r, p.qpos, 0.0) is not None
            if stands0(0.0):
                dx, ev = S0.lean_for_zero(stands0, 0.0, DX0[key])
                p = P.pose(r, d0, (M0.X, z), M0.TOOL_KG, "palm", com_dx=dx, dy=dy)
                w1 = window(r, p.qpos, 0.0)
                row.update({"relean": True, "dx1": dx, "evals": ev, "w1": list(w1), "ok": bool(p.ok),
                            "covers": S0.covers(w1, 0.0, F_HI)})
                if S0.covers(w1, 0.0, F_HI):
                    LEAN[key] = (p, dx)
            else:
                row.update({"relean": True, "dx1": None, "w1": None, "covers": False,
                            "why": "does not stand at zero press even upright (com_dx 0)"})
        m = float(r.model.body_subtreemass[1])
        row["mass"] = m
        row["sole"] = sole_len(r, M0.POSE[key].qpos)
        row["width_analytic"] = S0.window_width(m, row["sole"], M0.GRIP[key], M0.TOOL_KG)
        rows.append(row)
    return rows


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M0.mujoco.__version__}, "F_hi": F_HI, "b": BRAKED_E, "H": HB}
    print("# Milestone 41: a stance that stands at zero press")
    rowsA = part_A()
    out["A"] = rowsA
    print("## A. Leaned poses (milestone 32's set): robot z dy | lean dx0 (mm), window (N) | re-lean dx1 (mm), "
          "window | covers 0-50 | analytic width vs simulated")
    for x in rowsA:
        s = f"  {x['robot']} {x['z']:.1f} {x['dy']:+.2f} | {1e3 * x['dx0']:6.1f} [{x['w0'][0]:5.1f}, {x['w0'][1]:6.1f}]"
        if x["relean"]:
            s += (f""" | {('none' if x['dx1'] is None else f'{1e3 * x["dx1"]:6.1f}')} """
                  + ("-" if x["w1"] is None else f"[{x['w1'][0]:4.1f}, {x['w1'][1]:6.1f}]")
                  + f" | {'yes' if x['covers'] else 'NO'}")
        else:
            s += " | kept"
        s += f" | {x['width_analytic']:6.1f} vs {x['w0'][1] - x['w0'][0]:6.1f}"
        print(s)
    rel = [x for x in rowsA if x["relean"]]
    out["n_relean"], out["n_cover"] = len(rel), sum(x["covers"] for x in rel)
    shifts = [1e3 * (x["dx0"] - x["dx1"]) for x in rel if x["dx1"] is not None]
    print(f"re-leaned {len(rel)} of {len(rowsA)} poses; {out['n_cover']} cover 0-{F_HI} N; lean moved back "
          + (f"{min(shifts):.1f}-{max(shifts):.1f} mm" if shifts else "-"))
    ref = ("g1",) + M0.REF
    if ref in [(x["robot"], x["z"], x["dy"]) for x in rel] and ref not in LEAN:
        print("(milestone 30's calibration pose has no zero-press stance: it keeps its lean, calibration only)")
    print()

    print("(milestone 38's setup, imported again on the re-leaned poses:)")
    M1 = load("m38z", releaned)
    print()
    moved = sorted(k for k in LEAN if k in M1.KEYS)
    out["moved_in_keys"] = [list(k) for k in moved]
    out["signs_changed"] = {n: bool(np.any(M0.SIGNS[n] != M1.SIGNS[n])) for n in M1.ROB}
    out["keys"] = {"m38": len(M0.KEYS), "m41": len(M1.KEYS)}
    lost = sorted(k for k in LEAN if k not in M1.KEYS)
    print(f"re-leaned poses with a 'hold-min' solution: {len(moved)} of {len(LEAN)}"
          + (f" (none at {[list(k) for k in lost]})" if lost else "")
          + f"; controller's chosen sides changed: {out['signs_changed']}")

    GAP0 = M1.GAP * M1.AM                        # 5 arcmin, every joint (milestone 38's GAPR before any case)

    def gaps(n):
        names = M1.ROB[n][1]
        wi = [j for j in range(len(names)) if M1.kind(n, j) == "waist"]
        return WA.case_gaps(names, wi, GAP0, "braked")

    S_STAR = 10.0

    def task_B(args):
        n, H = args
        M1.GAPR = gaps(n)
        t1 = time.time()
        best = {"all": None, "moved": None}
        for i in M1.phis_for(H):
            phi = M1.PHIS[i] if H > 0 else 0.0
            for a in M1.AXES:
                e = BRAKED_E * a
                for key, mu in M1.residuals(n, H, phi, e, S_STAR).items():
                    y = abs(mu["y"][0]) / M1.MM
                    for g in ("all", "moved") if key in LEAN else ("all",):
                        if best[g] is None or y > best[g]["y"]:
                            best[g] = {"y": y, "at": list(key[1:]), "phi": round(math.degrees(phi))}
        return {"robot": n, "H": H, "worst": best, "s": time.time() - t1}

    def task_C(n):
        M1.GAPR = gaps(n)
        rows = []
        for key in [k for k in M1.KEYS if k[0] == n]:
            t = M1.TQ[key]
            held = M1.B.held(t[0], t[1], M1.TAUF)
            jp, jr = M1.POSE[key].rows[:2]
            v = M1.stack(M1.B.from_rows(jp, jr, M1.B.joint_sigmas(M1.T.quant_sigma(12), M1.GAPR, ~held), M1.L0))
            rows.append({"robot": n, "pose": list(key[1:]), "stack": v, "moved": key in LEAN})
        return rows

    procs = int(os.environ.get("M41_PROCS", "4"))
    ctx = M1.mp.get_context("fork")
    with ctx.Pool(procs) as pool:
        resB = pool.map(task_B, [(n, H) for n in ("h1", "g1") for H in HB], chunksize=1)
        resC = pool.map(task_C, ["h1", "g1"], chunksize=1)
    out["B"] = resB
    out["C"] = [r for x in resC for r in x]
    m40 = json.load(open(os.path.join(HERE, "..", "m40_liftoff", "results.json")))

    def m40B(n, H):
        w = [r for r in m40["B"] if r["robot"] == n and r["case"] == "braked" and r["comp"] == "uniform"
             and r["H"] == H][0]["worst"]
        return abs(w["y"]) / 1e-3
    print("(section B tasks: " + ", ".join(f"{x['robot']} H {x['H']:g} {x['s']:.0f} s" for x in resB) + ")")
    print(f"## B. Worst residual along the wall (mm), 'braked' waist, |e| {BRAKED_E} N, S 10 N, m 0.1 N m: "
          "robot | H | all poses (milestone 40 'uniform') | re-leaned poses only (where)")
    WB = {}
    for x in sorted(resB, key=lambda x: (x["robot"], x["H"])):
        a, mv = x["worst"]["all"], x["worst"]["moved"]
        WB[(x["robot"], x["H"])] = a["y"] if a else None
        print(f"  {x['robot']} {x['H']:5.1f} | {a['y'] if a else float('nan'):.3f} ({m40B(x['robot'], x['H']):.3f}) | "
              + (f"{mv['y']:.3f} at {mv['at']} phi {mv['phi']}" if mv else "-"))
    print()

    print("## C. No-hose clean-sheet stack, 'braked': robot | pose | re-leaned stack | milestone 40 (same pose)")
    m40D = {(r["robot"], tuple(r["pose"])): r["uniform"] for r in m40["D"] if r["case"] == "braked"}
    drops = {}
    for r in out["C"]:
        old = m40D.get((r["robot"], tuple(r["pose"])))
        if r["moved"]:
            print(f"  {r['robot']} {r['pose']} | {r['stack']:.4f} | " + ("-" if old is None else f"{old:.4f}"))
    for n in ("g1", "h1"):
        new = min(r["stack"] for r in out["C"] if r["robot"] == n)
        old = min(v for (rn, _), v in m40D.items() if rn == n)
        drops[n] = 100 * (old - new)
        print(f"  {n}: worst pose over all {new:.4f} (milestone 40 {old:.4f}), loss {drops[n]:+.2f} points")
    print()

    print("## D. Hypotheses (registered in LOG.md before this run)")
    E = {}
    E["H156"] = out["n_cover"] == out["n_relean"]
    print(f"H156 (every pose that needs a press has a zero-press lean covering 0-50 N): {out['n_cover']} of "
          f"{out['n_relean']} -> {'held' if E['H156'] else 'refuted'}")
    E["H157"] = bool(shifts) and max(shifts) <= 20.0
    print(f"H157 (the re-lean moves the balanced CoM back by at most 20 mm): largest "
          f"{max(shifts) if shifts else float('nan'):.1f} mm -> {'held' if E['H157'] else 'refuted'}")
    E["H158"] = len(moved) == len(LEAN)
    print(f"H158 (every re-leaned pose keeps a 'hold-min' solution): {len(moved)} of {len(LEAN)} -> "
          f"{'held' if E['H158'] else 'refuted'}")
    g5, h5 = WB.get(("g1", 5.0)), WB.get(("h1", 5.0))
    E["H159"] = g5 is not None and h5 is not None and g5 <= 0.1 and h5 <= 0.1
    print(f"H159 (braked, |e| 0.2 N, 5 N drag: worst residual at most 0.1 mm on both robots): G1 {g5:.3f}, H1 {h5:.3f} -> "
          f"{'held' if E['H159'] else 'refuted'}")
    E["H160"] = max(drops.values()) <= 0.5
    print(f"H160 (the worst-pose no-hose stack loses at most 0.5 points): G1 {drops['g1']:+.2f}, H1 "
          f"{drops['h1']:+.2f} -> {'held' if E['H160'] else 'refuted'}")
    out["E"] = E
    if not SMOKE:
        json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M0.mujoco.__version__})")

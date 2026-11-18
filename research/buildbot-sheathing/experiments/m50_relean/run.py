"""Milestone 50: re-lean the eight high-grip poses under hose drag, and the drag each pose tolerates.

Milestone 49 found the poses milestone 48 could not plan are a stance limit: a backward hose lowers the top of the
press window about 0.75-0.8 N per newton of drag. Statics, mu 0.5, milestone 48's import (M1).
A. Every pose of milestone 48's set at its current lean: per hose direction, the largest hose tension H (bisected
   on [0, 60] N) at which both 25 and 50 N balance. B. The 8 poses with no S_H: com_dx on a 5 mm grid over
   [0, 0.15] m, the worst cone slack over the 17 loads at {25, 50} N and at {0, 25, 50} N. C. At each pose's best
   section B lean for {25, 50} N: milestone 48's side search (the largest loaded common leg margin over every side
   combination). D. Hypotheses H204-H207.
M50_PROCS sets the pool (default 4).
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import itertools
import json
import math
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
T0 = time.time()
spec = importlib.util.spec_from_file_location("m49", os.path.join(HERE, "..", "m49_backload", "run.py"))
D49 = importlib.util.module_from_spec(spec)
sys.modules["m49"] = D49
spec.loader.exec_module(D49)                     # milestone 49 (and so milestone 48's object)
R48, M1, GQ0 = D49.R, D49.M1, D49.GQ0
P = sys.modules["buildbot_payload.model"]
RES48 = json.load(open(os.path.join(HERE, "..", "m48_loadside", "results.json")))
NOSH = sorted((a["robot"],) + tuple(a["pose"]) for a in RES48["A"] if a["ml_h"] is None)
LOADS = R48.LOADS                                # 17: (0, 0), then 5 and 20 N in 8 directions
DXS = [round(0.005 * i, 3) for i in range(31)]   # com_dx grid, 0 to 0.15 m
GOAL = R48.GOAL
HMAX = 60.0
SLOPE49 = 0.78                                   # milestone 49: N of press top lost per N of backward drag


def ok_at(r, q, key, H, phi, forces):
    fh = np.asarray(M1.hose_f(key, H, phi), float)
    # balances: milestone 49's balance-and-cones feasibility (cone_slack returns a negative slack, not None, when
    # the cones cannot hold; the first run read that as balanced and its section A was void)
    return all(GQ0.margin_lp(M1.contact(r, q, F, M1.TOOL_KG, fh), [], [])[1] is not None for F in forces)


def worst_slack(r, q, key, forces):
    """Worst cone slack (N) over the 17 loads and the given press forces; -inf if one does not balance."""
    w, at = np.inf, None
    for H, phi in LOADS:
        fh = np.asarray(M1.hose_f(key, H, phi), float)
        for F in forces:
            s = D49.cone_slack(M1.contact(r, q, F, M1.TOOL_KG, fh))
            s = -np.inf if s is None else s
            if s < w:
                w, at = s, (H, round(math.degrees(phi)), F)
    return w, at


def top_nohose(r, q, key):
    """Largest press (N) that balances with no hose, bisected on [0, 200]; None if 0 N does not."""
    bal = lambda F: ok_at(r, q, key, 0.0, 0.0, [F])  # noqa: E731
    if not bal(M1.F_HI / 2):
        return None
    a, b = M1.F_HI / 2, 200.0
    if bal(b):
        return b
    for _ in range(30):
        m = (a + b) / 2
        a, b = (m, b) if bal(m) else (a, m)
    return a


def lean(key, dx):
    n, z, dy = key
    r = M1.ROB[n][0]
    return P.pose(r, P.standing(r), (M1.X, z), M1.TOOL_KG, "palm", com_dx=dx, dy=dy)


def task_A(key, dx=None):
    r = M1.ROB[key[0]][0]
    q = M1.POSE[key].qpos if dx is None else lean(key, dx).qpos
    tol = []
    for phi in M1.PHIS:
        bal = lambda H: ok_at(r, q, key, H, phi, (M1.F_HI / 2, M1.F_HI))  # noqa: E731
        if not bal(0.0):
            tol.append(None)
            continue
        if bal(HMAX):
            tol.append(HMAX)
            continue
        a, b = 0.0, HMAX
        for _ in range(25):
            m = (a + b) / 2
            a, b = (m, b) if bal(m) else (a, m)
        # monotonicity spot check: every 1 N below the found H balances
        mono = all(bal(h) for h in np.arange(0.0, a, 1.0))
        tol.append((a, bool(mono)))
    return key, tol, top_nohose(r, q, key)


def task_B(args):
    key, dx = args
    n, z, dy = key
    r = M1.ROB[n][0]
    p = P.pose(r, P.standing(r), (M1.X, z), M1.TOOL_KG, "palm", com_dx=dx, dy=dy)
    if not p.ok:
        return key, dx, None, None, None, None
    w2, a2 = worst_slack(r, p.qpos, key, (M1.F_HI / 2, M1.F_HI))
    w3, a3 = worst_slack(r, p.qpos, key, (0.0, M1.F_HI / 2, M1.F_HI))
    return key, dx, w2, a2, w3, a3


def refine(key, lo, hi, it=24):
    """Ternary search of the worst [25, 50] N slack over com_dx in [lo, hi] (m); returns (dx, slack)."""
    r = M1.ROB[key[0]][0]
    f = lambda dx: worst_slack(r, lean(key, dx).qpos, key, (M1.F_HI / 2, M1.F_HI))[0]  # noqa: E731
    for _ in range(it):
        a, b = lo + (hi - lo) / 3, hi - (hi - lo) / 3
        lo, hi = (lo, b) if f(a) >= f(b) else (a, hi)
    dx = (lo + hi) / 2
    return dx, f(dx)


def task_R(args):
    key, dx = args
    rdx, rs = refine(key, max(0.0, dx - 0.005), dx + 0.005)
    _, tol, top = task_A(key, rdx)
    return key, rdx, rs, tol, top


def task_C(args):
    key, dx = args
    n, z, dy = key
    r = M1.ROB[n][0]
    M1.POSE[key] = P.pose(r, P.standing(r), (M1.X, z), M1.TOOL_KG, "palm", com_dx=dx, dy=dy)
    best, bs, at = None, None, None
    for combo in itertools.product((-1.0, 1.0), repeat=len(M1.SIGNS[n])):
        m, a = R48.loaded_margin(key, np.array(combo), -np.inf if best is None else best)
        if m is not None and (best is None or m > best):
            best, bs, at = m, combo, a
    return key, dx, best, bs, at


if __name__ == "__main__":
    procs = int(os.environ.get("M50_PROCS", "4"))
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "goal": GOAL, "nosh": [list(k) for k in NOSH]}
    deg = [round(math.degrees(p)) for p in M1.PHIS]
    keys = sorted(M1.KEYS)
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resA = pool.map(task_A, keys, chunksize=1)
    print("# Milestone 50: re-lean under hose drag (statics, mu 0.5)")
    print(f"## A. Largest hose tension (N, up to {HMAX:g}) at which 25 and 50 N both balance, current lean; "
          "* = a 1 N step below it failed (not monotone); press top with a slack hose (H 0: its hanging weight only)")
    print("robot | pose | no S_H | " + " | ".join(f"phi {d}" for d in deg) + " | worst | press top, slack hose (N)")
    out["A"] = []
    for key, tol, top in resA:
        hs = [None if t is None else (t if isinstance(t, float) else t[0]) for t in tol]
        mono = all(t is None or isinstance(t, float) or t[1] for t in tol)
        cells = ["none" if h is None else f"{h:.1f}" + ("" if isinstance(t, float) or t[1] else "*")
                 for h, t in zip(hs, tol)]
        worst = min((h for h in hs if h is not None), default=None)
        print(f"  {key[0]} {list(key[1:])} | {'yes' if key in NOSH else '-'} | " + " | ".join(cells)
              + f" | {worst:.1f} | " + ("none" if top is None else f"{top:.1f}"))
        out["A"].append({"robot": key[0], "pose": list(key[1:]), "nosh": key in NOSH, "H": hs, "mono": mono,
                         "worst": worst, "top0": top})
    print(f"(section A {time.time() - T0:.0f} s)\n")

    with M1.mp.get_context("fork").Pool(procs) as pool:
        resB = pool.map(task_B, [(k, dx) for k in NOSH for dx in DXS], chunksize=1)
    print("## B. The 8 poses with no S_H: worst cone slack (N) over the 17 loads by com_dx; "
          "[25, 50] = both firing ends, [0, 50] = also standing at zero press")
    out["B"] = []
    best = {}
    for key in NOSH:
        rows = [x for x in resB if x[0] == key]
        cur = next(a for a in RES48["A"] if (a["robot"],) + tuple(a["pose"]) == key)
        f = lambda w: "IK fail" if w is None else ("none" if w == -np.inf else f"{w:+.2f}")  # noqa: E731
        print(f"  {key[0]} {list(key[1:])}: " + "; ".join(f"{1e3 * dx:.0f} mm {f(w2)}/{f(w3)}"
                                                         for _, dx, w2, _, w3, _ in rows))
        ok2 = [x for x in rows if x[2] is not None and x[2] > 0]
        ok3 = [x for x in rows if x[4] is not None and x[4] > 0]
        b2 = max((x for x in rows if x[2] is not None), key=lambda x: x[2])
        b3 = max((x for x in rows if x[4] is not None), key=lambda x: x[4])
        best[key] = b2[1]
        rec = {"robot": key[0], "pose": list(key[1:]),
               "grid": [{"dx": dx, "w2": None if w2 is None else float(w2), "at2": a2,
                         "w3": None if w3 is None else float(w3), "at3": a3} for _, dx, w2, a2, w3, a3 in rows],
               "dx_ok2": [x[1] for x in ok2], "dx_ok3": [x[1] for x in ok3],
               "best2": {"dx": b2[1], "w": float(b2[2]), "at": b2[3]},
               "best3": {"dx": b3[1], "w": float(b3[4]), "at": b3[5]}}
        out["B"].append(rec)
        print(f"     [25, 50] balances under every load at com_dx "
              + (f"{1e3 * min(rec['dx_ok2']):.0f}-{1e3 * max(rec['dx_ok2']):.0f} mm ({len(ok2)} grid points)"
                 if ok2 else "nowhere on the grid")
              + f"; best {1e3 * b2[1]:.0f} mm slack {b2[2]:+.2f} N (worst at H, phi, F = {b2[3]}); [0, 50] "
              + (f"at {1e3 * min(rec['dx_ok3']):.0f}-{1e3 * max(rec['dx_ok3']):.0f} mm" if ok3 else "nowhere")
              + f"; best {1e3 * b3[1]:.0f} mm slack {b3[4]:+.2f} N (at {b3[5]})")
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resR = pool.map(task_R, [(k, best[k]) for k in NOSH], chunksize=1)
    print("## B2. Refined best lean (ternary search within 5 mm of the grid best) and the drag it tolerates "
          "(N, 25 and 50 N both balance), per hose direction")
    print("robot | pose | com_dx (mm) | worst slack (N) | " + " | ".join(f"phi {d}" for d in deg)
          + " | press top, slack hose (N)")
    for key, rdx, rs, tol, top in resR:
        hs = [None if t is None else (t if isinstance(t, float) else t[0]) for t in tol]
        print(f"  {key[0]} {list(key[1:])} | {1e3 * rdx:.1f} | {rs:+.2f} | "
              + " | ".join("none" if h is None else f"{h:.1f}" for h in hs)
              + " | " + ("none" if top is None else f"{top:.1f}"))
        rec = out["B"][NOSH.index(key)]
        rec["refined"] = {"dx": rdx, "w": float(rs), "H": hs, "top0": top}
    print(f"(section B {time.time() - T0:.0f} s)\n")

    cjobs = [(k, best[k]) for k in NOSH if max(out["B"][NOSH.index(k)]["best2"]["w"], out["B"][NOSH.index(k)]["refined"]["w"]) > 0]
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resC = pool.map(task_C, cjobs, chunksize=1)
    print(f"## C. Milestone 48's side search at each pose's best [25, 50] lean (goal {GOAL:.4f} N m)")
    out["C"] = []
    for key, dx, m, s, at in resC:
        print(f"  {key[0]} {list(key[1:])} com_dx {1e3 * dx:.0f} mm | best loaded margin "
              + ("none (no side plans at every load)" if m is None else f"{m:.4f} N m, sides "
                 + "".join("+" if v > 0 else "-" for v in s) + f", worst load {at}"))
        out["C"].append({"robot": key[0], "pose": list(key[1:]), "dx": dx, "margin": m,
                         "signs": None if s is None else list(s), "at": at})
    print(f"(section C {time.time() - T0:.0f} s)\n")

    print("## D. Hypotheses")
    h204 = all(r["dx_ok2"] or r["refined"]["w"] > 0 for r in out["B"])
    h205 = all(r["dx_ok3"] for r in out["B"])
    i180 = deg.index(180)
    dev = []
    for a in out["A"]:
        if a["nosh"]:
            pred = (a["top0"] - M1.F_HI) / SLOPE49
            got = a["H"][i180]
            dev.append((a["robot"], a["pose"], got, pred, abs(got - pred) / pred))
    h206 = all(d[4] <= 0.15 for d in dev)
    cm = {(c["robot"],) + tuple(c["pose"]): c["margin"] for c in out["C"]}
    h207 = bool(h204) and all(cm.get(k) is not None and cm[k] >= GOAL for k in NOSH)
    for d in dev:
        print(f"  H206 {d[0]} {d[1]}: tolerated at phi 180 {d[2]:.1f} N, linear prediction {d[3]:.1f} N, "
              f"off {100 * d[4]:.0f}%")
    out["D"] = {"H204": h204, "H205": h205, "H206": h206, "H207": h207,
                "dev206": [list(d) for d in dev]}
    out["D"]["tested"] = {"H207": bool(h204)}
    for h in ("H204", "H205", "H206", "H207"):
        st = "not tested (conditional on H204)" if h == "H207" and not h204 else ("held" if out["D"][h] else "refuted")
        print(f"  {h}: {st}")
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s)")

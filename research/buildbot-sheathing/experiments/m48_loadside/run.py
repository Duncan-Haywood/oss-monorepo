"""Milestone 48: per-pose hold sides scored by the worst common leg margin over the hose sweep.

Milestone 47 picked each pose's hold sides S* by the common leg margin at zero hose force; the H1 improved but the
G1 went over the 0.03 mm spec at 20 N of hose drag, a leg joint flipping under load at three poses. Here every pose
of both robots in milestone 41's set gets S_H: the combination (16 for the H1, 64 for the G1) whose smallest common
leg margin over both window ends and all 17 hose loads (0 N, and 5 and 20 N in each of 8 directions; exact sensor)
is largest; ties go to the larger zero-force margin, then the per-robot side. A pose takes S_H only if its zero-force margin reaches 0.1/beta (so it
plans with the spec's own 0.1 N m preload); otherwise it keeps milestone 46's sides and plan. The score sees only
hose loads and margins, never sensor errors or residuals, so section D is not fitted to.
A. Sides and margins per pose. B. Spec stack at every pose whose sides differ from milestone 47's. C. Each robot's
worst spec stack. D. Each robot's worst residual along the wall. E. Hypotheses H193-H198.

M48_SMOKE=1 runs a fast code check (numbers not results); M48_PROCS sets the pool (default 4).
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
if _os.environ.get("M48_SMOKE"):
    _os.environ["M47_SMOKE"] = "1"
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
SMOKE = bool(os.environ.get("M48_SMOKE"))
T0 = time.time()
spec = importlib.util.spec_from_file_location("m47", os.path.join(HERE, "..", "m47_poseside", "run.py"))
R47 = importlib.util.module_from_spec(spec)
sys.modules["m47"] = R47
spec.loader.exec_module(R47)                     # milestone 47's object (and so 46's, 45's, ... 38's)
R46, R45, R44, R43 = R47.R46, R47.R45, R47.R44, R47.R43
M1, GQ0, GOAL = R47.M1, R47.GQ0, R47.GOAL
SIDE = R47.SIDE                                  # milestone 47's per-pose override, filled here with S_H
HB = R45.HB
LOADS = [(H, (M1.PHIS[i] if H > 0 else 0.0)) for H in sorted(HB, reverse=True) for i in M1.phis_for(H)]  # hardest first
TIE = 1e-9


def loaded_margin(key, signs, floor=-np.inf):
    """(smallest common leg margin over both window ends and every hose load, the load at it); None: no plan.
    Stops early (returns the running minimum) once it falls below ``floor``: such a side cannot reach the top."""
    r, names, legs = M1.ROB[key[0]]
    q = M1.POSE[key].qpos
    hold = list(M1.light(key[0]))
    worst, at = np.inf, None
    for H, phi in LOADS:
        fh = M1.hose_f(key, H, phi)
        for F in (M1.F_HI / 2, M1.F_HI):
            cm = M1.contact(r, q, F, M1.TOOL_KG, np.asarray(fh, float))
            fn, _ = GQ0.solve(cm, "hold", legs, signs, M1.TAUF, hold_idx=hold)
            if fn is None:
                return None, (H, round(math.degrees(phi)))
            rows, kap, d = M1.PL.margin_rows(cm.tau(fn), legs, M1.TAUF)
            t, _ = M1.PL.margin_lp(cm, rows, kap, d)
            if t is None:
                return None, (H, round(math.degrees(phi)))
            if t < worst:
                worst, at = t, (H, round(math.degrees(phi)))
                if worst < floor:
                    return worst, at
    return worst, at


def side_task(key):
    """S_H: the largest loaded margin; ties (within TIE) broken by the larger zero-force margin, then the
    per-robot side. The loaded score saturates at tau_f whenever a leg joint's nominal torque sits inside the
    friction band at some load (margin_rows gives it two rows, tau_f -/+ tau), so ties are common."""
    s0 = np.asarray(M1.SIGNS[key[0]], float)
    m0, a0 = loaded_margin(key, s0)
    cand = [(s0, m0, a0)] if m0 is not None else []
    for combo in itertools.product((-1.0, 1.0), repeat=len(s0)):
        s = np.array(combo)
        if np.array_equal(s, s0):
            continue
        top = max((c[1] for c in cand), default=-np.inf)
        m, a = loaded_margin(key, s, top - 2 * TIE)
        if m is not None and m >= top - TIE:
            cand.append((s, m, a))
    n_top = len(cand)
    if not cand:
        return key, s0, None, (None, None), m0, R47.margin(key, s0), 0, 0
    top = max(c[1] for c in cand)
    tied = [c for c in cand if c[1] >= top - TIE]
    zs = [R47.margin(key, c[0]) for c in tied]
    zs = [-np.inf if z is None else z for z in zs]
    zt = max(zs)
    pick = [i for i, z in enumerate(zs) if z >= zt - TIE]
    i = next((i for i in pick if np.array_equal(tied[i][0], s0)), pick[0])
    s, m, a = tied[i]
    z = None if zs[i] == -np.inf else zs[i]
    return key, s, m, a, m0, z, n_top, len(tied)


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "goal": GOAL, "loads": len(LOADS)}
    procs = int(os.environ.get("M48_PROCS", "4"))
    keys = sorted(M1.KEYS)
    if SMOKE:
        keys = [k for k in keys if k[0] == "h1"][-3:]
    R47.SIDE.clear()
    m47 = json.load(open(os.path.join(HERE, "..", "m47_poseside", "results.json")))
    STAR = {(a["robot"],) + tuple(a["pose"]): a for a in m47["A"] if not a["skipped"]}
    S47 = {tuple([x[0]] + x[1:]): np.array(STAR[tuple([x[0]] + x[1:])]["sstar"]) for x in m47["changed"]}
    print(f"# Milestone 48: per-pose hold sides S_H (largest common leg margin over {len(LOADS)} hose loads x 2 "
          f"window ends), goal margin {GOAL:.4f} N m")
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resA = pool.map(side_task, keys, chunksize=1)
    print(f"(section A {time.time() - T0:.0f} s)")
    fmt = lambda s: "".join("+" if x > 0 else "-" for x in s)  # noqa: E731
    fm = lambda m: "none" if m is None else f"{m:.4f}"  # noqa: E731
    # milestone 47's S* scored on the loads, for the comparison column
    with M1.mp.get_context("fork").Pool(procs) as pool:
        lstar = pool.starmap(loaded_margin, [(k, np.array(STAR[k]["sstar"])) for k in keys], chunksize=1)
    LST = dict(zip(keys, lstar))
    print("## A. robot | pose | per-robot | S* (m47) | S_H | loaded margin per-robot, S*, S_H (N m) [load at S_H's "
          "worst: H, phi] | zero-force margin S*, S_H | combinations that led the search when scored (tied at the top loaded margin)")
    out["A"] = []
    for k, s, m, at, m0, z, n, nt in resA:
        s0 = np.asarray(M1.SIGNS[k[0]], float)
        ss = np.array(STAR[k]["sstar"])
        ch = not np.array_equal(s, s0)
        if ch and z is not None and z >= GOAL:
            SIDE[k] = s
        ls = LST[k][0]
        print(f"  {k[0]} {list(k[1:])} | {fmt(s0)} | {fmt(ss)} | {fmt(s)}{' =S*' if np.array_equal(s, ss) else ''}"
              f"{'' if k in SIDE else ' (kept m46)'} | {fm(m0)}, {fm(ls)}, {fm(m)} [{at[0]}, {at[1]}] | "
              f"{fm(STAR[k]['m_star'])}, {fm(z)} | {n} ({nt} tied)")
        out["A"].append({"robot": k[0], "pose": list(k[1:]), "signs": [float(x) for x in s0],
                         "sstar": [float(x) for x in ss], "sh": [float(x) for x in s], "ml_robot": m0, "ml_star": ls,
                         "ml_h": m, "at": list(at), "mz_star": STAR[k]["m_star"], "mz_h": z, "n_ok": n, "n_tied": nt,
                         "on_sh": k in SIDE, "same_as_star": bool(np.array_equal(s, ss))})
    for n in M1.ROB:
        kk = [k for k in keys if k[0] == n]
        print(f"  {n}: poses on S_H {sum(1 for k in SIDE if k[0] == n)} of {len(kk)}; S_H = S* at "
              f"{sum(1 for x in out['A'] if x['robot'] == n and x['same_as_star'])}")
    out["on_sh"] = [[k[0]] + list(k[1:]) for k in sorted(SIDE)]
    print()

    # milestone 47's stack per pose (its composite of milestones 43, 45, 46 overridden by its own section B)
    m43 = json.load(open(os.path.join(HERE, "..", "m43_specstack", "results.json")))
    S47v = {(r["case"], r["robot"], tuple(r["pose"])): r["spec"] for r in m43["rows"] if r["lean"] == "zero"}
    m45 = json.load(open(os.path.join(HERE, "..", "m45_tiered", "results.json")))
    for r in m45["B"]:
        S47v[(r["case"], r["robot"], tuple(r["pose"]))] = r["spec"]
    m46 = json.load(open(os.path.join(HERE, "..", "m46_holdside", "results.json")))
    for r in m46["B"]:
        S47v[(r["case"], "h1", tuple(m46["pose"][1:]))] = r["spec"]
    for r in m47["B"]:
        S47v[(r["case"], r["robot"], tuple(r["pose"]))] = r["spec"]

    diff = [k for k in keys if (k in SIDE) != (k in S47) or (k in SIDE and not np.array_equal(SIDE[k], S47[k]))]
    jobs = [("zero", c, k) for k in diff for c in R44.CASES]
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resB = pool.map(R47.stack_task, jobs, chunksize=1)
    print(f"(section B {time.time() - T0:.0f} s)")
    print("## B. Spec stack at the poses whose sides differ from milestone 47's: robot | pose | case | S_H | "
          "squeeze (N) | milestone 47 | change (points)")
    out["B"] = []
    NEW = {}
    for (lean, c, k), r in zip(jobs, resB):
        v, o = r["spec"], S47v.get((c, k[0], k[1:]))
        NEW[(c, k)] = v
        out["B"].append({"robot": k[0], "pose": list(k[1:]), "case": c, "spec": v, "squeeze": r.get("squeeze"),
                         "m47": o})
        print(f"  {k[0]} {list(k[1:])} | {c:6s} | " + ("   -  " if v is None else f"{v:.4f}") + " | "
              + ("-" if r.get("squeeze") is None else f"{r['squeeze']:+.2f}") + " | " + fm(o) + " | "
              + ("-" if v is None or o is None else f"{100 * (v - o):+.2f}"))
    print()

    print("## C. Worst spec stack over each robot's poses: robot | case | S_H worst | at | poses with a plan | "
          "milestone 47 worst | poses with a plan")
    out["C"] = {}
    for n in M1.ROB:
        for c in R44.CASES:
            new, old = [], []
            for k in keys:
                if k[0] != n:
                    continue
                o = S47v.get((c, n, k[1:]))
                v = NEW.get((c, k), o) if k in diff else o
                if v is not None:
                    new.append((v, k[1:]))
                if o is not None:
                    old.append((o, k[1:]))
            if not new or not old:
                continue
            (v, at), (o, ato) = min(new), min(old)
            out["C"][f"{n} {c}"] = {"new": v, "at": list(at), "n": len(new), "m47": o, "n47": len(old)}
            print(f"  {n} | {c:6s} | {v:.4f} | {list(at)} | {len(new)} | {o:.4f} | {len(old)}")
    print()

    with M1.mp.get_context("fork").Pool(procs) as pool:
        resD = pool.map(R45.task_D, [(n, H) for n in ("h1", "g1") for H in HB], chunksize=1)
    out["D"] = resD
    m41 = json.load(open(os.path.join(HERE, "..", "m41_stance0", "results.json")))
    W41 = {(x["robot"], x["H"]): x["worst"]["all"]["y"] for x in m41["B"]}
    W47 = {(x["robot"], x["H"]): x for x in m47["D"]}
    print("(section D tasks: " + ", ".join(f"{x['robot']} H {x['H']:g} {x['s']:.0f} s" for x in resD) + ")")
    print(f"## D. Worst residual along the wall (mm), 'braked', |e| {R45.B_E} N, S {R45.S_STAR:g} N: robot | H | all "
          "poses (at, phi) | milestone 47 | milestone 41 | cases at m44's two poses with no plan (milestone 47)")
    WD = {}
    for x in resD:
        a = x["worst"]["all"]
        WD[(x["robot"], x["H"])] = a["y"]
        r47 = W47[(x["robot"], x["H"])]
        miss = f"{x['miss']} of {x['cases']} ({r47['miss']})" if x["robot"] == "h1" else "-"
        print(f"  {x['robot']} | {x['H']:5.1f} | {a['y']:.3f} ({a['at']}, phi {a['phi']}) | "
              f"{r47['worst']['all']['y']:.3f} | {W41[(x['robot'], x['H'])]:.3f} | {miss}")
    print()

    print("## E. Hypotheses (registered in LOG.md before this run)")
    E = {}
    g = [WD.get(("g1", H)) for H in HB]
    E["H193"] = all(a is not None and a <= 0.03 + 1e-9 for a in g)
    print("H193 (G1 worst at most 0.03 mm at every drag): " + ", ".join(f"{a:.3f}" for a in g)
          + f" -> {'held' if E['H193'] else 'refuted'}")
    lim = [W41[("g1", H)] + 0.005 for H in HB]
    E["H194"] = all(a is not None and a <= b + 1e-9 for a, b in zip(g, lim))
    print("H194 (G1 worst at most milestone 41's + 0.005 mm): " + ", ".join(f"{a:.3f} (<= {b:.3f})" for a, b in zip(g, lim))
          + f" -> {'held' if E['H194'] else 'refuted'}")
    h = [WD.get(("h1", H)) for H in HB]
    lim = [W47[("h1", H)]["worst"]["all"]["y"] + 0.005 for H in HB]
    E["H195"] = all(a is not None and a <= b + 1e-9 for a, b in zip(h, lim))
    print("H195 (H1 worst at most milestone 47's + 0.005 mm): " + ", ".join(f"{a:.3f} (<= {b:.3f})" for a, b in zip(h, lim))
          + f" -> {'held' if E['H195'] else 'refuted'}")
    low = [(x["robot"], x["pose"], x["ml_h"]) for x in out["A"] if x["ml_h"] is None or x["ml_h"] < GOAL]
    E["H196"] = not low
    print(f"H196 (every pose's S_H loaded margin at least {GOAL:.4f}): smallest "
          f"{min(x['ml_h'] for x in out['A'] if x['ml_h'] is not None):.4f}, below: {low} -> "
          f"{'held' if E['H196'] else 'refuted'}")
    cb = {n: out["C"][f"{n} braked"] for n in M1.ROB if f"{n} braked" in out["C"]}
    E["H197"] = all(x["new"] >= x["m47"] - 0.001 - 1e-9 for x in cb.values())
    print("H197 ('braked' worst stack at least milestone 47's minus 0.1 points): "
          + ", ".join(f"{n} {x['new']:.4f} ({x['m47']:.4f})" for n, x in cb.items())
          + f" -> {'held' if E['H197'] else 'refuted'}")
    miss = sum(x["miss"] for x in resD if x["robot"] == "h1")
    E["H198"] = miss <= 18
    print(f"H198 (H1 cases at m44's two poses with no plan at most milestone 47's 18): {miss} of "
          f"{sum(x['cases'] for x in resD if x['robot'] == 'h1')} -> {'held' if E['H198'] else 'refuted'}")
    out["E"] = E
    if not SMOKE:
        json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

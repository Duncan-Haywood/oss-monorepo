"""Milestone 53: the pose-cases still without a plan under milestone 52's slack calibration, and hold sides per load.

Milestone 52 (its run imported unchanged) left 33 pose-cases with no plan inside an envelope (26 inside milestone
51's, 2 more inside the pose-only one). ``plan`` fails at one of two stages at either window end (25 or 50 N): the
'hold' QP on the pose's hold sides, or the leg-preload solve (``solve_margin``, tiered at milestone 45's poses).
A. Per dropped case: the failing stage and window end on the pose's sides; at a preload failure the largest common
   leg margin ``margin_lp`` reaches, the preload asked for, and the leg joint binding at the optimum; how many of
   the 2^n side combinations have a 'hold' solution at each end.
B. The per-load rule: keep the pose's sides when they plan; otherwise search every hold-side combination and take
   the one with the largest common leg margin at the measured load (f + e, both window ends) among those whose full
   plan solves. The rule is keyed on the measured load, which the plan already uses, so a robot can run it.
C. Residual along the wall (slack calibration) for every recovered case; each robot's coverage and worst residual
   inside milestone 51's envelope (cases that already plan are untouched, so their numbers are milestone 52's).
D. Hypotheses H214-H216 (LOG.md, registered before the run). M53_PROCS sets the pool (default 4).
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
spec = importlib.util.spec_from_file_location("m52", os.path.join(HERE, "..", "m52_slackcal", "run.py"))
E52 = importlib.util.module_from_spec(spec)
sys.modules["m52"] = E52
spec.loader.exec_module(E52)                     # milestone 52's object (and so 51's, 48's sides, ... 38's)
E51, R, M1, R45, R43 = E52.E51, E52.R, E52.M1, E52.R45, E52.R43
R44, R47 = R45.R44, R.R47
GQ0 = R.GQ0
SIDE = R47.SIDE                                  # per-pose hold sides (milestone 48's S_H where installed)
SPEC = E52.SPEC
RES52 = json.load(open(os.path.join(HERE, "..", "m52_slackcal", "results.json")))
fmt = lambda s: "".join("+" if x > 0 else "-" for x in s)  # noqa: E731


def sides(key):
    return np.asarray(SIDE.get(key, M1.SIGNS[key[0]]), float)


def ends(key, fm, signs):
    """Per window end: (F, stage reached, margin_lp t, asked preload, binding leg joint, combos with a hold solution).
    stage: 'hold' (the hold QP has no solution), 'preload' (solve_margin has none) or 'ok'."""
    n = key[0]
    r, names, legs = M1.ROB[n]
    q = M1.POSE[key].qpos
    hold = list(M1.light(n))
    out = []
    for F in (M1.F_HI / 2, M1.F_HI):
        cm = M1.contact(r, q, F, M1.TOOL_KG, np.asarray(fm, float))
        nh = sum(GQ0.solve(cm, "hold", legs, np.array(c), M1.TAUF, hold_idx=hold)[0] is not None
                 for c in itertools.product((-1.0, 1.0), repeat=len(signs)))
        fn, _ = GQ0.solve(cm, "hold", legs, signs, M1.TAUF, hold_idx=hold)
        if fn is None:
            out.append({"F": F, "stage": "hold", "t": None, "ask": None, "bind": None, "n_hold": nh})
            continue
        rows, kap, d = M1.PL.margin_rows(cm.tau(fn), legs, M1.TAUF)
        t, fo = M1.PL.margin_lp(cm, rows, kap, d)
        bind = None
        if fo is not None:
            mg = kap * cm.tau(fo)[rows] + d
            bind = names[int(rows[int(np.argmin(mg))])]
        ask = R45.TIER.get(key, R44.MLEG.get(key, R44.M_SPEC))
        R45.CUR[0] = key
        M1.M_LEG = R44.MLEG.get(key, R44.M_SPEC)
        try:
            ok = M1.PL.solve_margin(cm, legs, rows, kap, d, M1.M_LEG) is not None
        finally:
            R45.CUR[0] = None
            M1.M_LEG = R44.M_SPEC
        out.append({"F": F, "stage": "ok" if ok else "preload", "t": t, "ask": ask, "bind": bind, "n_hold": nh})
    return out


def common_margin(key, fm, signs):
    """Smallest margin_lp common leg margin over both window ends at the measured load (None: no hold solution)."""
    r, names, legs = M1.ROB[key[0]]
    q = M1.POSE[key].qpos
    ts = []
    for F in (M1.F_HI / 2, M1.F_HI):
        cm = M1.contact(r, q, F, M1.TOOL_KG, np.asarray(fm, float))
        fn, _ = GQ0.solve(cm, "hold", legs, signs, M1.TAUF, hold_idx=list(M1.light(key[0])))
        if fn is None:
            return None
        rows, kap, d = M1.PL.margin_rows(cm.tau(fn), legs, M1.TAUF)
        t, _ = M1.PL.margin_lp(cm, rows, kap, d)
        if t is None:
            return None
        ts.append(t)
    return min(ts)


def joint_err_with(key, f, e, signs):
    old = SIDE.get(key)
    SIDE[key] = np.asarray(signs, float)
    M1.PLANS.clear()                             # the plan cache is keyed without the sides
    try:
        return M1.joint_err(key, f, e, R45.S_STAR)
    finally:
        if old is None:
            SIDE.pop(key, None)
        else:
            SIDE[key] = old
        M1.PLANS.clear()


def task(d):
    n, H, p, phd, ax = d[0], d[1], d[2], d[3], d[4]
    R47.set_tier(True)
    M1.GAPR = R43.gaps(M1, n, "braked")
    key = (n,) + tuple(json.loads(p))
    i = [round(math.degrees(x)) for x in M1.PHIS].index(phd) if H > 0 else 0
    phi = M1.PHIS[i] if H > 0 else 0.0
    e = R45.B_E * M1.AXES[ax]
    f = M1.hose_f(key, H, phi)
    fm = np.asarray(f, float) + np.asarray(e, float)
    ref = E51.ref_key(n)
    er_s = M1.joint_err(ref, M1.hose_f(ref, 0.0, 0.0), e, R45.S_STAR)    # slack calibration, pose's own sides
    s0 = sides(key)
    check = M1.joint_err(key, f, e, R45.S_STAR)                          # milestone 52: None
    A = ends(key, fm, s0)
    best, n_plan = None, 0
    for c in itertools.product((-1.0, 1.0), repeat=len(s0)):
        s = np.array(c)
        ep = joint_err_with(key, f, e, s)
        if ep is None:
            continue
        n_plan += 1
        m = common_margin(key, fm, s)
        if m is not None and (best is None or m > best[0] + 1e-12):
            best = (m, s, ep)
    y = None
    flips = None
    if best is not None and er_s is not None:
        y = E52.y_mm(key, ref, best[2], er_s)
        flips = [M1.ROB[n][1][j] for j, a, b in zip(M1.light(n), s0, best[1]) if a != b]
    return {"robot": n, "H": H, "pose": list(key[1:]), "phi": phd, "axis": ax, "in51": bool(d[8]),
            "check_none": check is None, "A": A, "sides": fmt(s0), "n_plan": n_plan,
            "best": None if best is None else {"sides": fmt(best[1]), "margin": best[0], "flips": flips},
            "y": y, "exact": bool(d[7])}


if __name__ == "__main__":
    procs = int(os.environ.get("M53_PROCS", "4"))
    drops = RES52["drops"]
    with M1.mp.get_context("fork").Pool(procs) as pool:
        res = pool.map(task, drops, chunksize=1)
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "rows": res}
    print("# Milestone 53: milestone 52's remaining drops, failing stage and hold sides per measured load")
    print(f"drops read from milestone 52: {len(drops)}; all still without a plan on the pose's sides: "
          f"{all(x['check_none'] for x in res)}")
    fm = lambda v: "-" if v is None else f"{v:.4f}"  # noqa: E731
    print("## A. robot | H | pose | phi | axis | class (m52) | pose sides | per window end 25 N; 50 N: stage "
          "[margin_lp t / preload asked, binding leg joint] (combos with a hold solution of 2^n)")
    for x in res:
        cl = ("plan limit" if not x["exact"] else "sensor error") + ("" if x["in51"] else ", pose-only")
        parts = []
        for a in x["A"]:
            ask = a["ask"]
            ask = "-" if ask is None else (f"{ask[0]:.4f}/{ask[1]:.4f}" if isinstance(ask, (tuple, list)) else f"{ask:.4f}")
            extra = "" if a["stage"] == "hold" else f" [{fm(a['t'])} / {ask}, {a['bind']}]"
            parts.append(f"{a['stage']}{extra} ({a['n_hold']})")
        print(f"  {x['robot']} | {x['H']:4.1f} | {x['pose']} | {x['phi']} | {x['axis']} | {cl} | {x['sides']} | "
              + "; ".join(parts))
    stage = {}
    for x in res:
        st = next((a["stage"] for a in x["A"] if a["stage"] != "ok"), "ok")
        k = (x["robot"], "plan limit" if not x["exact"] else "sensor error", st)
        stage[k] = stage.get(k, 0) + 1
    print("  first failing stage counts (robot | class | stage | n):")
    for k in sorted(stage):
        print(f"  {k[0]} | {k[1]} | {k[2]} | {stage[k]}")

    print("\n## B/C. Per-load rule: robot | H | pose | phi | axis | combos whose full plan solves (of 2^n) | "
          "chosen sides (joints flipped from the pose's) | common leg margin (N m) | |y| slack calibration (mm)")
    for x in res:
        b = x["best"]
        print(f"  {x['robot']} | {x['H']:4.1f} | {x['pose']} | {x['phi']} | {x['axis']} | {x['n_plan']} | "
              + ("none" if b is None else f"{b['sides']} ({', '.join(b['flips']) or 'none'}) | {b['margin']:.4f}")
              + f" | {fm(x['y'])}")
    tot = RES52["totals"]
    summ = RES52["summary"]
    C = {}
    print("\n## C. Inside milestone 51's envelope: robot | planned m52 | recovered | planned now | cases | coverage | "
          "worst |y| at 0 / 5 / 20 N (m52 -> now, mm)")
    for n in ("g1", "h1"):
        rec = [x for x in res if x["robot"] == n and x["in51"] and x["y"] is not None]
        t = tot[n]
        now = t["in51_ps"] + len(rec)
        ws = []
        for H in R45.HB:
            w0 = summ[f"{n} {H:g}"]["worst_in51"]
            w1 = max([w0] + [x["y"] for x in rec if x["H"] == H])
            ws.append((w0, w1))
        C[n] = {"m52": t["in51_ps"], "recovered": len(rec), "now": now, "cases": t["in51"],
                "coverage": 100 * now / t["in51"], "worst": ws}
        print(f"  {n} | {t['in51_ps']} | {len(rec)} | {now} | {t['in51']} | {100 * now / t['in51']:.1f}% | "
              + " / ".join(f"{a:.4f} -> {b:.4f}" for a, b in ws))
    po = [x for x in res if not x["in51"]]
    print(f"  pose-only envelope extras recovered: {sum(x['y'] is not None for x in po)} of {len(po)}")

    print("\n## D. Hypotheses (registered in LOG.md before this run)")
    D = {}
    pl = [x for x in res if not x["exact"]]
    nh = sum(next((a["stage"] for a in x["A"] if a["stage"] != "ok"), "ok") == "hold" for x in pl)
    D["H214"] = nh > 13
    print(f"H214 (hold QP is the failing stage at more than 13 of the 26 plan-limit cases): {nh} of {len(pl)} -> "
          f"{'held' if D['H214'] else 'refuted'}")
    left = [(x["robot"], x["H"], x["pose"], x["phi"], x["axis"]) for x in res if x["y"] is None]
    D["H215"] = not left
    print(f"H215 (per-load rule plans every one of the {len(res)} drops): {len(res) - len(left)} recovered, left "
          f"{left} -> {'held' if D['H215'] else 'refuted'}")
    ys = [x["y"] for x in res if x["y"] is not None]
    D["H216"] = all(y <= SPEC + 1e-12 for y in ys) and all(b <= SPEC + 1e-12 for c in C.values() for _, b in c["worst"])
    print(f"H216 (every recovered |y| at most {SPEC} mm): largest {max(ys) if ys else float('nan'):.4f} -> "
          f"{'held' if D['H216'] else 'refuted'}")
    out["C"] = C
    out["D"] = D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

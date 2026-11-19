"""Milestone 55: a held-or-free margin that covers the sensor error on every joint, arms included.

Milestone 54 (its run imported unchanged) found 4 planned in-envelope pose-cases over the 0.03 mm spec, each one
joint whose planned torque sat a few hundredths of a N m from the 0.2 N m friction torque, so plan and robot
disagreed on whether it is held. ``preload.settle`` is linear in the load, so the change from planned to settled
torque is linear in the load error: dtau_j = G_j delta. G is read from three extra ``plan`` calls at the same
measured load with the truth moved by B along x, y and z (a fourth, along -x, checks the linearity). The robust
rule, run from the measured load only:
  1. plan on the pose's sides and re-choose the squeeze on milestone 38's grid over [-S, S] to maximise the smallest
     robust margin ||tau_j| - tau_f| - r_j over the arm joints (r_j = B ||G_j||, inside each joint's torque limit);
     accept if the robust margin is >= 0 on every actuated joint at both window ends;
  2. otherwise every hold-side combination, each with its own robust squeeze, taking the one with the largest
     smallest robust margin among those that pass;
  3. otherwise no plan.
The slack calibration plan is held to the same rule. A: milestone 54's 48 loads at its 6 sensor axes. B: 48 fresh
Latin-hypercube loads (seed 55) with 6 sensor errors of 0.2 N in random directions (seed 55); milestone 54's rule
(pose sides, else milestone 53's per-load sides) is scored on the same fresh loads for comparison.
Hypotheses H220-H222 (LOG.md, registered before the run). M55_PROCS sets the pool (default 4); M55_N the number of
loads per section (default 48).
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
os.environ.setdefault("M54_N", os.environ.get("M55_N", "48"))
spec = importlib.util.spec_from_file_location("m54", os.path.join(HERE, "..", "m54_lhs", "run.py"))
E54 = importlib.util.module_from_spec(spec)
sys.modules["m54"] = E54
spec.loader.exec_module(E54)                     # milestone 54's object (and so 53's, 52's, ... 38's)
E53, E52, E51, R, M1, R45, R43 = E54.E53, E54.E52, E54.E51, E54.R, E54.M1, E54.R45, E54.R43
SPEC = E54.SPEC
from buildbot_sheathing import preload as PLM  # noqa: E402
EPS = 1e-9
B = R45.B_E                                      # the sensor bound, N (0.2)
N = int(os.environ.get("M55_N", "48"))
UNIT = np.eye(3)


def rand_dirs(n, seed):
    rng = np.random.default_rng(seed)
    v = rng.normal(size=(n, 3))
    return [x / np.linalg.norm(x) for x in v]


SECTIONS = {"A": {"loads": E54.lhs(N, 54), "errs": [B * a for a in M1.AXES]},
            "B": {"loads": E54.lhs(N, 55), "errs": [B * a for a in rand_dirs(6, 55)]}}


def plan_forces(key, fm):
    """Milestone 38's ``plan`` loop with milestones 44 and 45's wrappers (leg preload, tiers) and the current hold
    sides, from the measured load fm: per window end (F, the planned contact forces, the planned torques without
    squeeze). None without a plan. ``check_plan`` compares it with ``M1.plan``."""
    n = key[0]
    r, names, legs = M1.ROB[n]
    q = M1.POSE[key].qpos
    M1.M_LEG = R45.R44.MLEG.get(key, R45.R44.M_SPEC)
    R45.CUR[0] = key
    try:
        out = []
        for F in (M1.F_HI / 2, M1.F_HI):
            cm = M1.contact(r, q, F, M1.TOOL_KG, np.asarray(fm, float))
            fn, _ = M1.GQ.solve(cm, "hold", legs, M1.SIGNS[n], M1.TAUF, hold_idx=M1.light(n))
            if fn is None:
                return None
            rows, kap, d = M1.PL.margin_rows(cm.tau(fn), legs, M1.TAUF)
            fn = M1.PL.solve_margin(cm, legs, rows, kap, d, M1.M_LEG)
            if fn is None:
                return None
            out.append((F, fn, np.asarray(cm.tau(fn), float)))
        return out
    finally:
        R45.CUR[0] = None
        M1.M_LEG = R45.R44.M_SPEC


def settled(key, pf, f_true):
    """The robot's torques (no squeeze) after settling under the true load, for planned forces pf."""
    r = M1.ROB[key[0]][0]
    q = M1.POSE[key].qpos
    out = []
    for F, fn, _ in pf:
        ct = M1.contact(r, q, F, M1.TOOL_KG, np.asarray(f_true, float))
        out.append(np.asarray(ct.tau(PLM.settle(ct, fn)), float))
    return out


def robust(key, fm, S=None):
    """Robust plan from the measured load fm on the current hold sides. Returns None (no plan) or a dict with the
    robust margin m (min over every joint and both ends), the chosen squeeze s, the planned forces and torques
    (both ends, squeeze applied); 'pass' is m >= 0; 'lin' the linearity-check misfit (N m); 'legfail' whether any
    joint below the margin is a leg joint (the only ones the hold sides move)."""
    S = R45.S_STAR if S is None else S
    fm = np.asarray(fm, float)
    pf = plan_forces(key, fm)
    if pf is None:
        return None
    n = key[0]
    a = np.asarray(M1.SQA[key], float)
    tp_raw = [t for _, _, t in pf]
    G = [np.zeros((len(a), 3)) for _ in range(2)]
    for c in range(3):
        ts = settled(key, pf, fm + B * UNIT[c])
        for w in range(2):
            G[w][:, c] = (ts[w] - tp_raw[w]) / B
    ts = settled(key, pf, fm - B * UNIT[0])
    lin = max(float(np.max(np.abs((ts[w] - tp_raw[w]) + B * G[w][:, 0]))) for w in range(2))
    r = [B * np.linalg.norm(g, axis=1) for g in G]
    arms = np.asarray(M1.ARMS[key], int)
    lim = np.maximum(M1.LIM[n], np.maximum(np.abs(tp_raw[0]), np.abs(tp_raw[1])))
    step = 0.05
    k = int(round(S / step)) if S > 0 else 0
    sg = np.linspace(-k * step, k * step, 2 * k + 1)
    best = None
    for w in range(2):
        if len(arms):
            T = tp_raw[w][arms][None, :] + sg[:, None] * a[arms][None, :]
            mg = np.min(np.abs(np.abs(T) - M1.TAUF) - r[w][arms][None, :], axis=1)
            ok = np.all(np.abs(T) <= lim[arms][None, :], axis=1)
            mg = np.where(ok, mg, -np.inf)
        else:
            mg = np.zeros(len(sg))
        best = mg if best is None else np.minimum(best, mg)
    i = np.lexsort((np.abs(sg), -best))[0]
    s = float(sg[i])
    tp = [t + a * s for t in tp_raw]
    mj = np.minimum(*[np.abs(np.abs(tp[w]) - M1.TAUF) - r[w] for w in range(2)])
    m = float(np.min(mj))
    j = int(np.argmin(mj))
    legs = set(int(x) for x in M1.ROB[n][2])
    legfail = any(int(jj) in legs for jj in np.flatnonzero(mj < 0))
    return {"m": m, "pass": m >= 0.0, "s": s, "pf": pf, "tp": tp, "a": a, "lin": lin, "legfail": legfail,
            "bind": M1.ROB[n][1][j], "rmax": max(float(np.max(x)) for x in r)}


def robot_err(key, f, e, rp):
    """The joint error when the robot runs the robust plan rp (made from f + e) under the true load f."""
    ta = [t + rp["a"] * rp["s"] for t in settled(key, rp["pf"], f)]
    return M1.FT.joint_error(ta, rp["tp"], M1.TQ[key], M1.TAUF, M1.GAPR, M1.KREG, 0.0), ta


def check_plan(key, f, e):
    """Largest |difference| (N m) between the replica (planned and settled torques with milestone 38's own
    squeeze) and ``M1.plan``; None if exactly one of them has no plan, 0 if neither plans."""
    p = M1.plan(key, np.asarray(f, float), np.asarray(e, float), R45.S_STAR)
    pf = plan_forces(key, np.asarray(f, float) + np.asarray(e, float))
    if (p is None) != (pf is None):
        return None
    if p is None:
        return 0.0
    a = np.asarray(M1.SQA[key], float)
    ta = settled(key, pf, f)
    return max(max(float(np.max(np.abs(pf[w][2] + a * p[2] - p[1][w]))),
                   float(np.max(np.abs(ta[w] + a * p[2] - p[0][w])))) for w in range(2))


def with_sides(key, signs, fn):
    old = E53.SIDE.get(key)
    E53.SIDE[key] = np.asarray(signs, float)
    M1.PLANS.clear()
    try:
        return fn()
    finally:
        if old is None:
            E53.SIDE.pop(key, None)
        else:
            E53.SIDE[key] = old
        M1.PLANS.clear()


def robust_rule(key, f, e):
    """(how, robust margin, error, flips between plan and robot, sides flipped, n combos passing, lin)."""
    fm = np.asarray(f, float) + np.asarray(e, float)
    rp = robust(key, fm)
    if rp is not None and rp["pass"]:
        ep, ta = robot_err(key, f, e, rp)
        fl = int(np.sum(PLM.flips(ta, rp["tp"], M1.TAUF)))
        return "pose sides", rp, ep, fl, [], None
    if rp is not None and not rp["legfail"]:
        # every joint below the margin is above the legs (waist, arms): the hold sides move only the ground
        # reaction, so only the leg torques; no side combination can pass (the 2-load smoke run: 25 of 25)
        return "none", rp, None, None, None, "skipped"
    s0 = E53.sides(key)
    best, npass = None, 0
    for c in itertools.product((-1.0, 1.0), repeat=len(s0)):
        sv = np.array(c)

        def go():
            q = robust(key, fm)
            if q is None or not q["pass"]:
                return None
            ep, ta = robot_err(key, f, e, q)
            return q, ep, int(np.sum(PLM.flips(ta, q["tp"], M1.TAUF)))
        res = with_sides(key, sv, go)
        if res is None:
            continue
        npass += 1
        if best is None or res[0]["m"] > best[0]["m"] + 1e-12:
            best = res + (sv,)
    if best is None:
        return "none", rp, None, None, None, npass
    flips = [M1.ROB[key[0]][1][jj] for jj, x, y in zip(M1.light(key[0]), s0, best[3]) if x != y]
    return "per-load sides", best[0], best[1], best[2], flips, npass


def base_rule(key, f, e):
    """Milestone 54's rule: pose sides, else milestone 53's per-load search (largest common leg margin)."""
    ep = M1.joint_err(key, f, e, R45.S_STAR)
    if ep is not None:
        return "pose sides", ep
    fm = np.asarray(f, float) + np.asarray(e, float)
    best = None
    for c in itertools.product((-1.0, 1.0), repeat=len(E53.sides(key))):
        s = np.array(c)
        eps_ = E53.joint_err_with(key, f, e, s)
        if eps_ is None:
            continue
        m = E53.common_margin(key, fm, s)
        if m is not None and (best is None or m > best[0] + 1e-12):
            best = (m, eps_)
    return ("none", None) if best is None else ("per-load sides", best[1])


def task_limits(args):
    key, phis = args
    R.R47.set_tier(True)
    return key, [E54.limit(key, math.radians(p)) for p in phis]


def task(args):
    sec, n, j, lim = args
    H, phd = SECTIONS[sec]["loads"][j]
    phi = math.radians(phd)
    R.R47.set_tier(True)
    M1.GAPR = R43.gaps(M1, n, "braked")
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    ref = E51.ref_key(n)
    f_slack = M1.hose_f(ref, 0.0, 0.0)
    rows = []
    for ai, e in enumerate(SECTIONS[sec]["errs"]):
        e = np.asarray(e, float)
        how_c, rc, er_r, fl_c, _, _ = robust_rule(ref, f_slack, e)
        er_b = M1.joint_err(ref, f_slack, e, R45.S_STAR)
        for k in keys:
            lk, lr = lim[str(list(k))], lim[str(list(ref))]
            in_pose = lk is not None and H <= lk + EPS
            in51 = in_pose and lr is not None and H <= lr + EPS
            f = M1.hose_f(k, H, phi)
            row = {"pose": list(k[1:]), "axis": ai, "in51": bool(in51), "in_pose": bool(in_pose),
                   "cal_robust": er_r is not None}
            if not in_pose:
                rows.append(row)
                continue
            how, rp, ep, fl, flips, npass = robust_rule(k, f, e)
            if ai == 0:
                row["check"] = check_plan(k, f, e)
            row.update({"how": how, "m": None if rp is None else rp["m"], "bind": None if rp is None else rp["bind"],
                        "rmax": None if rp is None else rp["rmax"], "lin": None if rp is None else rp["lin"],
                        "flips_robot": fl, "sides_flipped": flips, "npass": npass,
                        "y": None if (ep is None or er_r is None) else E52.y_mm(k, ref, ep, er_r)})
            if sec == "B":
                hb, eb = base_rule(k, f, e)
                row["base_how"] = hb
                row["y_base"] = None if (eb is None or er_b is None) else E52.y_mm(k, ref, eb, er_b)
            rows.append(row)
    return {"sec": sec, "robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


def summary(res, sec, n, ykey="y"):
    s = dict(in51=0, pl=0, none=0, w=0.0, at=None, over=[], inp=0, inp_pl=0, wp=0.0)
    for x in res:
        if x["sec"] != sec or x["robot"] != n:
            continue
        for r in x["rows"]:
            if not r["in_pose"]:
                continue
            y = r.get(ykey)
            s["inp"] += 1
            s["inp_pl"] += y is not None
            if y is not None:
                s["wp"] = max(s["wp"], y)
            if r["in51"]:
                s["in51"] += 1
                s["pl"] += y is not None
                s["none"] += y is None
                if y is not None and y > s["w"]:
                    s["w"], s["at"] = y, (r["pose"], round(x["H"], 2), round(x["phi"], 1), r["axis"])
                if y is not None and y > SPEC:
                    s["over"].append((r["pose"], round(x["H"], 2), round(x["phi"], 1), r["axis"], round(y, 4)))
    s["cov"] = 100.0 * s["pl"] / max(s["in51"], 1)
    return s


if __name__ == "__main__":
    procs = int(os.environ.get("M55_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B": B,
           "sections": {k: {"loads": v["loads"], "errs": [list(map(float, e)) for e in v["errs"]]}
                        for k, v in SECTIONS.items()}}
    lims = {}
    with ctx.Pool(procs) as pool:
        for sec in SECTIONS:
            phis = [p for _, p in SECTIONS[sec]["loads"]]
            L = pool.map(task_limits, [(k, phis) for k in allkeys], chunksize=1)
            lims[sec] = {str(list(k)): v for k, v in L}
        jobs = [(sec, n, j, {kk: v[j] for kk, v in lims[sec].items()})
                for sec in SECTIONS for n in ("g1", "h1") for j in range(N)]
        res = pool.map(task, jobs, chunksize=1)
    out["limits"] = lims
    out["runs"] = res
    print("# Milestone 55: a held-or-free margin covering the sensor error (B = %.2f N ball) on every joint" % B)
    for sec in SECTIONS:
        print(f"section {sec}: {N} loads, seed {54 if sec == 'A' else 55}; errors "
              + ("milestone 54's 6 axes" if sec == "A" else
                 "6 random directions: " + "; ".join("(" + ", ".join(f"{c:+.3f}" for c in e) + ")"
                                                     for e in SECTIONS[sec]["errs"])))
    lin = max((r["lin"] for x in res for r in x["rows"] if r.get("lin") is not None), default=0.0)
    print(f"linearity check (settled torque at -B x against -G_x B, every robust plan): largest misfit {lin:.2e} N m")
    ck = [r.get("check", 0.0) for x in res for r in x["rows"] if "check" in r]
    print(f"replica check against milestone 53's plan (error 0 of each load and pose, {len(ck)} cases): largest "
          f"|difference| {max(c for c in ck if c is not None):.2e} N m; plan/no-plan mismatches "
          f"{sum(c is None for c in ck)}")
    cal = {}
    for sec in SECTIONS:
        for n in ("g1", "h1"):
            v = [r["cal_robust"] for x in res if x["sec"] == sec and x["robot"] == n for r in x["rows"][:1]]
            cal[(sec, n)] = None
    print("\n## A/B. Robust rule: section | robot | in-envelope cases (m51) | planned | none | coverage | worst |y| mm "
          "(at pose, H, phi, error) | over spec | pose-only envelope: cases / planned / worst")
    S = {}
    for sec in SECTIONS:
        for n in ("g1", "h1"):
            s = summary(res, sec, n)
            S[f"{sec} {n}"] = s
            print(f"  {sec} | {n} | {s['in51']} | {s['pl']} | {s['none']} | {s['cov']:.1f}% | {s['w']:.4f} ({s['at']}) | "
                  f"{len(s['over'])} | {s['inp']} / {s['inp_pl']} / {s['wp']:.4f}")
    print("\n## B0. Milestone 54's rule on the fresh section-B loads (comparison): robot | cases | planned | coverage | "
          "worst |y| | over spec")
    for n in ("g1", "h1"):
        s = summary(res, "B", n, "y_base")
        S[f"B {n} base"] = s
        print(f"  {n} | {s['in51']} | {s['pl']} | {s['cov']:.1f}% | {s['w']:.4f} ({s['at']}) | {len(s['over'])} "
              + ("" if not s["over"] else str(s["over"][:6])))
    print("\n## C. How the robust rule planned (in milestone 51's envelope): section | robot | pose sides | per-load "
          "sides | none | held/side flips between plan and robot over planned cases | calibration failing the rule "
          "(of 6 errors)")
    for sec in SECTIONS:
        for n in ("g1", "h1"):
            rr = [r for x in res if x["sec"] == sec and x["robot"] == n for r in x["rows"] if r["in51"]]
            c = {h: sum(r["how"] == h for r in rr) for h in ("pose sides", "per-load sides", "none")}
            fl = sum(r["flips_robot"] or 0 for r in rr if r["y"] is not None)
            calf = len({r["axis"] for x in res if x["sec"] == sec and x["robot"] == n for r in x["rows"]
                        if not r["cal_robust"]})
            print(f"  {sec} | {n} | {c['pose sides']} | {c['per-load sides']} | {c['none']} | {fl} | {calf}")
    print("\n## C1. Milestone 54's 4 over-spec cases under the robust rule (section A)")
    m54 = [("g1", [0.4, -0.15], 290.2, 2), ("h1", [1.2, -0.15], 305.5, 0), ("h1", [1.2, -0.15], 305.5, 2),
           ("h1", [1.2, -0.15], 210.5, 0)]
    for n, pose, phd, ax in m54:
        for x in res:
            if x["sec"] == "A" and x["robot"] == n and abs(x["phi"] - phd) < 0.06:
                for r in x["rows"]:
                    if r["pose"] == pose and r["axis"] == ax:
                        print(f"  {n} {pose} H {x['H']:.2f} phi {x['phi']:.1f} axis {ax}: {r.get('how')}, robust margin "
                              f"{r.get('m') if r.get('m') is None else round(r['m'], 4)} N m (binding {r.get('bind')}), "
                              f"|y| {r.get('y') if r.get('y') is None else round(r['y'], 4)} mm")
    print("\n## C2. No robust plan inside milestone 51's envelope: section | robot | H | phi | pose | error | robust "
          "margin on the pose's sides (N m) | binding joint | largest r_j (N m) | side combinations passing")
    for x in res:
        for r in x["rows"]:
            if r["in51"] and r.get("how") == "none":
                print(f"  {x['sec']} | {x['robot']} | {x['H']:.2f} | {x['phi']:.1f} | {r['pose']} | {r['axis']} | "
                      + ("no plan" if r["m"] is None else f"{r['m']:+.4f} | {r['bind']} | {r['rmax']:.4f}")
                      + f" | {r['npass']}")
    print("\n## D. Hypotheses (registered in LOG.md before this run)")
    D = {}
    wA = max(S["A g1"]["w"], S["A h1"]["w"])
    D["H220"] = wA <= SPEC + 1e-12
    print(f"H220 (section A: every planned in-envelope case at most {SPEC} mm): worst g1 {S['A g1']['w']:.4f}, "
          f"h1 {S['A h1']['w']:.4f} -> {'held' if D['H220'] else 'refuted'}")
    D["H221"] = min(S["A g1"]["cov"], S["A h1"]["cov"]) >= 99.0
    print(f"H221 (section A coverage at least 99% each): g1 {S['A g1']['cov']:.2f}%, h1 {S['A h1']['cov']:.2f}% -> "
          f"{'held' if D['H221'] else 'refuted'}")
    wB = max(S["B g1"]["w"], S["B h1"]["w"])
    D["H222"] = wB <= SPEC + 1e-12 and min(S["B g1"]["cov"], S["B h1"]["cov"]) >= 99.0
    print(f"H222 (section B: in spec and coverage at least 99% each): worst {wB:.4f} mm, coverage g1 "
          f"{S['B g1']['cov']:.2f}%, h1 {S['B h1']['cov']:.2f}% -> {'held' if D['H222'] else 'refuted'}")
    out["S"] = S
    out["D"] = D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

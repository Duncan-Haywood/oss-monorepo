"""Milestone 56: weight the held-or-free margin by what a flip costs at the nose.

Milestone 55's robust rule (its run imported unchanged) asks every joint's planned torque to sit further than
r_j = B ||G_j|| from the friction torque at both press ends; it fixed milestone 54's spec misses but dropped 3 to 4%
of in-envelope presses, mostly at the waist, and none of those was out of spec under the old rule. The residual
along the wall is linear in the joint error (y = w . delta, w the wall row of ``backlash.tool_rows`` at the nose), so
``preload.flip_cost`` gives each joint's worst change of y over the held states its torque band can reach, and their
sum Y bounds the backlash part of the residual. The weighted rule, from the measured load only:
  1. on the pose's sides choose the squeeze on milestone 38's grid over [-S, S] to minimise Y (ties: larger smallest
     robust arm margin, then smaller |squeeze|); accept if Y <= BETA * SPEC;
  2. otherwise, if a leg joint has a non-zero cost (the hold sides move only the leg torques), every hold-side
     combination with its own squeeze, taking the smallest Y among those that pass;
  3. otherwise no plan.
The calibration keeps milestone 55's strict rule. Sections A and B are milestone 55's; C is fresh (seed 56 loads,
6 random-direction 0.2 N errors, seed 56). Hypotheses H223-H225 (LOG.md, registered before the run).
M56_PROCS sets the pool (default 4); M56_N the loads per section (default 48); M56_BETA the budget share (0.5).
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
os.environ["M55_N"] = os.environ.get("M56_N", "48")
spec = importlib.util.spec_from_file_location("m55", os.path.join(HERE, "..", "m55_robust", "run.py"))
E55 = importlib.util.module_from_spec(spec)
sys.modules["m55"] = E55
spec.loader.exec_module(E55)                     # milestone 55's object (and so 54's, ... 38's)
E54, E53, E52, E51, R, M1, R45, R43 = E55.E54, E55.E53, E55.E52, E55.E51, E55.R, E55.M1, E55.R45, E55.R43
SPEC, B, EPS = E55.SPEC, E55.B, E55.EPS
from buildbot_sheathing import preload as PLM  # noqa: E402
from buildbot_sheathing import backlash as BL  # noqa: E402
from buildbot_sheathing.pose_range import held_bias  # noqa: E402
N = int(os.environ.get("M56_N", "48"))
BETA = float(os.environ.get("M56_BETA", "0.5"))
BUDGET = BETA * SPEC                              # mm
UNIT = np.eye(3)
SECTIONS = dict(E55.SECTIONS)
SECTIONS["C"] = {"loads": E54.lhs(N, 56), "errs": [B * a for a in E55.rand_dirs(6, 56)]}


def wall_row(key):
    """Nose residual along the wall per radian of each joint's error, mm/rad (``compensate`` at offset L0)."""
    jp, jr = M1.POSE[key].rows[:2]
    return BL.tool_rows(jp, jr, np.array([M1.L0, 0.0, 0.0]))[1] / M1.MM


def weighted(key, fm, S=None):
    """Weighted plan from the measured load fm on the current hold sides: None (no plan) or a dict with the flip
    bound Y (mm), per-joint costs, the squeeze s, planned forces and torques, the robust arm margin m."""
    S = R45.S_STAR if S is None else S
    fm = np.asarray(fm, float)
    pf = E55.plan_forces(key, fm)
    if pf is None:
        return None
    n = key[0]
    a = np.asarray(M1.SQA[key], float)
    tp_raw = [t for _, _, t in pf]
    G = [np.zeros((len(a), 3)) for _ in range(2)]
    for c in range(3):
        ts = E55.settled(key, pf, fm + B * UNIT[c])
        for w in range(2):
            G[w][:, c] = (ts[w] - tp_raw[w]) / B
    r = [B * np.linalg.norm(g, axis=1) for g in G]
    wr = wall_row(key)
    arms = np.asarray(M1.ARMS[key], int)
    lim = np.maximum(M1.LIM[n], np.maximum(np.abs(tp_raw[0]), np.abs(tp_raw[1])))
    step = 0.05
    k = int(round(S / step)) if S > 0 else 0
    best = None
    for s in np.linspace(-k * step, k * step, 2 * k + 1):
        T = [t + a * s for t in tp_raw]
        if len(arms) and not all(np.all(np.abs(T[w][arms]) <= lim[arms]) for w in range(2)):
            continue
        cost = PLM.flip_cost(T[0], T[1], r[0], r[1], M1.TAUF, M1.GAPR, wr)
        Y = float(np.sum(cost))
        marg = (min(float(np.min(np.abs(np.abs(T[w][arms]) - M1.TAUF) - r[w][arms])) for w in range(2))
                if len(arms) else 0.0)
        kk = (Y, -marg, abs(s))
        if best is None or kk < best[0]:
            best = (kk, float(s), T, cost, marg)
    if best is None:
        return None
    _, s, tp, cost, marg = best
    legs = set(int(x) for x in M1.ROB[n][2])
    names = M1.ROB[n][1]
    j = int(np.argmax(cost))
    return {"Y": float(np.sum(cost)), "pass": float(np.sum(cost)) <= BUDGET + 1e-12, "s": s, "pf": pf, "tp": tp,
            "a": a, "m": marg, "legcost": any(cost[jj] > 0 for jj in legs), "bind": names[j],
            "nband": int(np.sum(cost > 0)), "wr": wr}


def robot_err(key, f, rp):
    """(joint error, the same error with the plan's held states, flips) when the robot runs rp under load f."""
    ta = [t + rp["a"] * rp["s"] for t in E55.settled(key, rp["pf"], f)]
    ep = M1.FT.joint_error(ta, rp["tp"], M1.TQ[key], M1.TAUF, M1.GAPR, M1.KREG, 0.0)
    held_part = held_bias(ta[0], ta[1], M1.TAUF, M1.GAPR) - held_bias(rp["tp"][0], rp["tp"][1], M1.TAUF, M1.GAPR)
    return ep, ep - held_part, int(np.sum(PLM.flips(ta, rp["tp"], M1.TAUF)))


def weighted_rule(key, f, e):
    """(how, plan, error, error without flips, flips, sides flipped, n combinations passing)."""
    fm = np.asarray(f, float) + np.asarray(e, float)
    rp = weighted(key, fm)
    if rp is not None and rp["pass"]:
        ep, enf, fl = robot_err(key, f, rp)
        return "pose sides", rp, ep, enf, fl, [], None
    if rp is not None and not rp["legcost"]:
        return "none", rp, None, None, None, None, "skipped"
    s0 = E53.sides(key)
    best, npass = None, 0
    for c in itertools.product((-1.0, 1.0), repeat=len(s0)):
        sv = np.array(c)

        def go():
            q = weighted(key, fm)
            if q is None or not q["pass"]:
                return None
            return (q,) + robot_err(key, f, q)
        res = E55.with_sides(key, sv, go)
        if res is None:
            continue
        npass += 1
        if best is None or res[0]["Y"] < best[0]["Y"] - 1e-12:
            best = res + (sv,)
    if best is None:
        return "none", rp, None, None, None, None, npass
    flips = [M1.ROB[key[0]][1][jj] for jj, x, y in zip(M1.light(key[0]), s0, best[4]) if x != y]
    return "per-load sides", best[0], best[1], best[2], best[3], flips, npass


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
        _, _, er_r, _, _, _ = E55.robust_rule(ref, f_slack, e)
        for k in keys:
            lk, lr = lim[str(list(k))], lim[str(list(ref))]
            in_pose = lk is not None and H <= lk + EPS
            in51 = in_pose and lr is not None and H <= lr + EPS
            row = {"pose": list(k[1:]), "axis": ai, "in51": bool(in51), "in_pose": bool(in_pose),
                   "cal": er_r is not None}
            if not in_pose:
                rows.append(row)
                continue
            f = M1.hose_f(k, H, phi)
            how, rp, ep, enf, fl, flips, npass = weighted_rule(k, f, e)
            ok = ep is not None and er_r is not None
            row.update({"how": how, "Y": None if rp is None else rp["Y"], "bind": None if rp is None else rp["bind"],
                        "nband": None if rp is None else rp["nband"], "flips_robot": fl, "sides_flipped": flips,
                        "npass": npass, "y": E52.y_mm(k, ref, ep, er_r) if ok else None,
                        "y_noflip": E52.y_mm(k, ref, enf, er_r) if ok else None})
            rows.append(row)
    return {"sec": sec, "robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


def summary(res, sec, n):
    s = dict(in51=0, pl=0, none=0, w=0.0, at=None, over=[], flipped=0, slack=None)
    for x in res:
        if x["sec"] != sec or x["robot"] != n:
            continue
        for r in x["rows"]:
            if not r["in51"]:
                continue
            y = r.get("y")
            s["in51"] += 1
            s["pl"] += y is not None
            s["none"] += y is None
            if y is None:
                continue
            if y > s["w"]:
                s["w"], s["at"] = y, (r["pose"], round(x["H"], 2), round(x["phi"], 1), r["axis"])
            if y > SPEC:
                s["over"].append((r["pose"], round(x["H"], 2), round(x["phi"], 1), r["axis"], round(y, 4)))
            s["flipped"] += (r["flips_robot"] or 0) > 0
            sl = r["Y"] - (y - r["y_noflip"])
            s["slack"] = sl if s["slack"] is None else min(s["slack"], sl)
    s["cov"] = 100.0 * s["pl"] / max(s["in51"], 1)
    return s


def m55_pairs(res):
    """Pair the A and B cases with milestone 55's (same section, robot, load, pose, error)."""
    p = os.path.join(HERE, "..", "m55_robust", "results.json")
    if not os.path.exists(p):
        return None
    old = json.load(open(p))
    if len(old["runs"]) and max(x["j"] for x in old["runs"]) + 1 != N:
        return None
    idx = {(x["sec"], x["robot"], x["j"], tuple(r["pose"]), r["axis"]): r for x in old["runs"] for r in x["rows"]}
    out = {}
    for x in res:
        if x["sec"] == "C":
            continue
        for r in x["rows"]:
            if not r["in51"]:
                continue
            o = idx.get((x["sec"], x["robot"], x["j"], tuple(r["pose"]), r["axis"]))
            if o is None:
                continue
            t = out.setdefault((x["sec"], x["robot"]), {"both": 0, "m55_only": 0, "m56_only": 0, "neither": 0,
                                                       "won_worst": 0.0})
            a, b = o.get("y") is not None, r.get("y") is not None
            t["both" if a and b else "m55_only" if a else "m56_only" if b else "neither"] += 1
            if b and not a:
                t["won_worst"] = max(t["won_worst"], r["y"])
    return out


if __name__ == "__main__":
    procs = int(os.environ.get("M56_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B": B, "beta": BETA, "budget_mm": BUDGET,
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
    print(f"# Milestone 56: a flip-cost-weighted held-or-free margin (budget {BETA} x {SPEC} mm = {BUDGET:.4f} mm "
          f"on the bound Y of the flips' nose shift; B = {B:.2f} N)")
    for sec in SECTIONS:
        print(f"section {sec}: {N} loads, seed {dict(A=54, B=55, C=56)[sec]}; errors "
              + ("milestone 54's 6 axes" if sec == "A" else
                 "6 random directions: " + "; ".join("(" + ", ".join(f"{c:+.3f}" for c in e) + ")"
                                                     for e in SECTIONS[sec]["errs"])))
    print("\n## A. Weighted rule: section | robot | in-envelope cases (m51) | planned | none | coverage | worst |y| mm "
          "(at pose, H, phi, error) | over spec | planned cases with a held/side flip | smallest (Y - flip shift) mm")
    S = {}
    for sec in SECTIONS:
        for n in ("g1", "h1"):
            s = summary(res, sec, n)
            S[f"{sec} {n}"] = s
            print(f"  {sec} | {n} | {s['in51']} | {s['pl']} | {s['none']} | {s['cov']:.1f}% | {s['w']:.4f} ({s['at']}) | "
                  f"{len(s['over'])} | {s['flipped']} | "
                  + ("-" if s["slack"] is None else f"{s['slack']:.2e}"))
    print("\n## B. How it planned (in milestone 51's envelope): section | robot | pose sides | per-load sides | none "
          "(skipped: no leg cost) | median / largest Y of planned mm | planned with Y > 0 (largest cost on: joint counts) | "
          "calibration failing milestone 55's rule (of 6)")
    for sec in SECTIONS:
        for n in ("g1", "h1"):
            rr = [r for x in res if x["sec"] == sec and x["robot"] == n for r in x["rows"] if r["in51"]]
            c = {h: sum(r["how"] == h for r in rr) for h in ("pose sides", "per-load sides", "none")}
            sk = sum(r["how"] == "none" and r["npass"] == "skipped" for r in rr)
            Ys = sorted(r["Y"] for r in rr if r["y"] is not None)
            pos = [r["bind"] for r in rr if r["y"] is not None and r["Y"] > 0]
            bc = {}
            for b in pos:
                bc[b] = bc.get(b, 0) + 1
            top = ", ".join(f"{b} {c}" for b, c in sorted(bc.items(), key=lambda t: -t[1])[:4])
            calf = len({r["axis"] for x in res if x["sec"] == sec and x["robot"] == n for r in x["rows"]
                        if not r["cal"]})
            print(f"  {sec} | {n} | {c['pose sides']} | {c['per-load sides']} | {c['none']} ({sk}) | "
                  + (f"{Ys[len(Ys) // 2]:.4f} / {Ys[-1]:.4f}" if Ys else "-") + f" | {len(pos)} ({top}) | {calf}")
    print("\n## C. Paired with milestone 55 (sections A and B, same cases): section | robot | both plan | only m55 | "
          "only m56 | neither | worst |y| of the cases m56 wins back mm")
    P = m55_pairs(res)
    if P is None:
        print("  (milestone 55's results.json is for another load count; not paired)")
    else:
        for (sec, n), t in sorted(P.items()):
            print(f"  {sec} | {n} | {t['both']} | {t['m55_only']} | {t['m56_only']} | {t['neither']} | "
                  f"{t['won_worst']:.4f}")
    print("\n## C1. Still no plan inside milestone 51's envelope: section | robot | H | phi | pose | error | Y on the "
          "pose's sides mm | joint with the largest cost | joints in band | side combinations passing")
    nl = 0
    for x in res:
        for r in x["rows"]:
            if r["in51"] and r.get("how") == "none":
                nl += 1
                if nl <= 40:
                    print(f"  {x['sec']} | {x['robot']} | {x['H']:.2f} | {x['phi']:.1f} | {r['pose']} | {r['axis']} | "
                          + ("no plan" if r["Y"] is None else f"{r['Y']:.4f} | {r['bind']} | {r['nband']}")
                          + f" | {r['npass']}")
    if nl > 40:
        print(f"  ... {nl - 40} more (results.json)")
    print("\n## D. Hypotheses (registered in LOG.md before this run)")
    D = {}
    w = max(S[k]["w"] for k in S)
    D["H223"] = w <= SPEC + 1e-12
    print(f"H223 (every planned in-envelope case at most {SPEC} mm, all sections): worst "
          + ", ".join(f"{k} {S[k]['w']:.4f}" for k in S) + f" -> {'held' if D['H223'] else 'refuted'}")
    cmin = min(S[k]["cov"] for k in S)
    D["H224"] = cmin >= 99.0
    print("H224 (coverage at least 99% each robot and section): " + ", ".join(f"{k} {S[k]['cov']:.2f}%" for k in S)
          + f" -> {'held' if D['H224'] else 'refuted'}")
    sl = min(S[k]["slack"] for k in S if S[k]["slack"] is not None)
    D["H225"] = sl >= -1e-9
    print(f"H225 (flip shift never beats the bound Y): smallest Y - shift {sl:.2e} mm -> "
          f"{'held' if D['H225'] else 'refuted'}")
    out["S"] = S
    out["D"] = D
    out["pairs"] = None if P is None else {f"{a} {b}": v for (a, b), v in P.items()}
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

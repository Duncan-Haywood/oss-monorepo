"""Milestone 59: the nail's depth point in the flip bound (four rows: nose y, z and depth point y, z).

Milestone 58 priced each joint's reachable backlash flip through the nose rows along (y) and across (z) the wall.
``compensate.compensated`` also returns the residual at the depth point, ``tool_lean.DEPTH_CHECK`` (sheathing plus
the required penetration, 44.4 mm) further along the nail, where the member's bound is checked; a flip that turns
the tool about the nose moves that point and not the nose, so the two-row bound cannot see it. Here each joint's flip
cost is taken through four rows of ``backlash.tool_rows`` (nose y, z; depth point y, z) over the same reachable held
states (``preload.flip_cost``). For budgets b (one per row; inf = unbudgeted) the rule is milestone 58's:
  1. on the pose's sides choose the squeeze on milestone 38's grid over [-S, S] to minimise max_k(Y_k/b_k)
     (ties: larger smallest robust arm margin, then smaller |squeeze|); accept if every Y_k <= b_k;
  2. otherwise, if a leg joint has a non-zero cost in a budgeted row (or the pose's sides have no plan), every
     hold-side combination with its own squeeze, taking the smallest objective among those that pass;
  3. otherwise no plan.
Configs: two-row (milestone 58's "iso": nose y and z at 0.015 mm, depth unbudgeted) and four-row (all four 0.015
mm). Section F is held out: 48 Latin-hypercube loads (seed 59) with 6 random-direction 0.2 N errors (seed 59).
Check: two-row against milestone 58's own ``rule_all`` ("iso") on the first M59_CHECK loads of each robot.
Hypotheses H232-H234 (LOG.md, registered before the run). M59_PROCS sets the pool (default 4); M59_N the loads.
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
N = int(os.environ.get("M59_N", "48"))
NCHECK = int(os.environ.get("M59_CHECK", "2"))
os.environ["M58_N"] = str(N)
spec = importlib.util.spec_from_file_location("m58", os.path.join(HERE, "..", "m58_tworow", "run.py"))
E58 = importlib.util.module_from_spec(spec)
sys.modules["m58"] = E58
spec.loader.exec_module(E58)                     # milestone 58's object (and so 56's, ... 38's)
E56, E55, E54, E53, E51 = E58.E56, E58.E55, E58.E54, E58.E53, E58.E51
R, M1, R43 = E58.R, E58.M1, E58.R43
SPEC, B, EPS, PLM, BL = E58.SPEC, E58.B, E58.EPS, E58.PLM, E58.BL
from buildbot_sheathing.tool_lean import DEPTH_CHECK  # noqa: E402  (m)

AX = ("y", "z", "yd", "zd")                       # nose along, nose across, depth point along, depth point across
BH = 0.5 * SPEC                                   # mm, half the spec per row (milestones 56 and 58)
INF = math.inf
CONFIGS = {"two-row": (BH, BH, INF, INF), "four-row": (BH, BH, BH, BH)}
SEED = 59
LOADS = E54.lhs(N, SEED)
ERRS = [B * a for a in E55.rand_dirs(6, SEED)]
UNIT = np.eye(3)


def rows4(key):
    """Displacement (mm/rad of each joint's error) of the nose along/across the wall and of the depth point."""
    jp, jr = M1.POSE[key].rows[:2]
    A = BL.tool_rows(jp, jr, np.array([M1.L0, 0.0, 0.0])) / M1.MM
    D = BL.tool_rows(jp, jr, np.array([M1.L0 + DEPTH_CHECK, 0.0, 0.0])) / M1.MM
    return A[1], A[2], D[1], D[2]


def plans(key, fm, S=None):
    """Plans on the current hold sides for every config: {name: None or dict(Y, obj, pass, s, pf, tp, a, legcost,
    bind)}. Mirrors ``m58.plans`` with four rows."""
    S = E58.R45.S_STAR if S is None else S
    fm = np.asarray(fm, float)
    pf = E55.plan_forces(key, fm)
    if pf is None:
        return {c: None for c in CONFIGS}
    n = key[0]
    a = np.asarray(M1.SQA[key], float)
    tp_raw = [t for _, _, t in pf]
    G = [np.zeros((len(a), 3)) for _ in range(2)]
    for c in range(3):
        ts = E55.settled(key, pf, fm + B * UNIT[c])
        for w in range(2):
            G[w][:, c] = (ts[w] - tp_raw[w]) / B
    r = [B * np.linalg.norm(g, axis=1) for g in G]
    W = rows4(key)
    arms = np.asarray(M1.ARMS[key], int)
    lim = np.maximum(M1.LIM[n], np.maximum(np.abs(tp_raw[0]), np.abs(tp_raw[1])))
    step = 0.05
    k = int(round(S / step)) if S > 0 else 0
    cand = []
    for s in np.linspace(-k * step, k * step, 2 * k + 1):
        T = [t + a * s for t in tp_raw]
        if len(arms) and not all(np.all(np.abs(T[w][arms]) <= lim[arms]) for w in range(2)):
            continue
        cs = [PLM.flip_cost(T[0], T[1], r[0], r[1], M1.TAUF, M1.GAPR, w) for w in W]
        marg = (min(float(np.min(np.abs(np.abs(T[w][arms]) - M1.TAUF) - r[w][arms])) for w in range(2))
                if len(arms) else 0.0)
        cand.append((float(s), T, cs, marg))
    legs = set(int(x) for x in M1.ROB[n][2])
    names = M1.ROB[n][1]
    out = {}
    for cname, bs in CONFIGS.items():
        best = None
        for s, T, cs, marg in cand:
            Y = [float(np.sum(c)) for c in cs]
            obj = max(0.0 if math.isinf(b) else y / b for y, b in zip(Y, bs))
            kk = (obj, -marg, abs(s))
            if best is None or kk < best[0]:
                best = (kk, s, T, cs, Y, obj)
        if best is None:
            out[cname] = None
            continue
        _, s, T, cs, Y, obj = best
        cost = sum(c / b for c, b in zip(cs, bs) if math.isfinite(b))
        out[cname] = {"Y": Y, "obj": obj, "pass": all(y <= b + 1e-12 for y, b in zip(Y, bs)),
                      "s": s, "pf": pf, "tp": T, "a": a, "bind": names[int(np.argmax(cost))],
                      "legcost": any(c[j] > 0 for c, b in zip(cs, bs) if math.isfinite(b) for j in legs)}
    return out


def resid(key, ref, rp, f, er_r):
    """Per axis (|r|, |r| with the plan's held states) in mm, and flips."""
    ep, enf, fl = E56.robot_err(key, f, rp)
    rows, rr = M1.POSE[key].rows[:2], M1.POSE[ref].rows[:2]
    c = M1.C.compensated(rows, rr, ep, er_r, M1.L0)
    c0 = M1.C.compensated(rows, rr, enf, er_r, M1.L0)
    v = {"y": c["y"][0], "z": c["z"][0], "yd": c["y"][1], "zd": c["z"][1]}
    v0 = {"y": c0["y"][0], "z": c0["z"][0], "yd": c0["y"][1], "zd": c0["z"][1]}
    o = {a: abs(v[a]) / M1.MM for a in AX} | {a + "0": abs(v0[a]) / M1.MM for a in AX}
    # tilt of the nail axis from the residual difference between the two points, mrad
    o["tilt"] = math.hypot(v["y"] - v["yd"], v["z"] - v["zd"]) / DEPTH_CHECK * 1e3
    o["flips"] = int(fl)
    return o


def slim(p, r):
    return {"Y": p["Y"], "bind": p["bind"]} | r


def rule_all(key, ref, f, e, er_r):
    """Outcome per config: {"how", plan summary or None}."""
    fm = np.asarray(f, float) + np.asarray(e, float)
    P = plans(key, fm)
    out, need = {}, []
    for c, p in P.items():
        if p is not None and p["pass"]:
            out[c] = {"how": "pose sides", **slim(p, resid(key, ref, p, f, er_r))}
        elif p is not None and not p["legcost"]:
            out[c] = {"how": "none", "bind": p["bind"]}
        else:
            need.append(c)
    if need:
        best = {c: None for c in need}
        s0 = E53.sides(key)
        for comb in itertools.product((-1.0, 1.0), repeat=len(s0)):
            sv = np.array(comb)

            def go():
                Q = plans(key, fm)
                got = {}
                for c in need:
                    q = Q[c]
                    if q is not None and q["pass"] and (best[c] is None or q["obj"] < best[c]["obj"] - 1e-12):
                        got[c] = slim(q, resid(key, ref, q, f, er_r)) | {"obj": q["obj"]}
                return got
            res = E55.with_sides(key, sv, go)
            for c, v in (res or {}).items():
                best[c] = v
        for c in need:
            p = P[c]
            out[c] = ({"how": "none", "bind": None if p is None else p["bind"]} if best[c] is None
                      else {"how": "per-load sides", **best[c]})
    return out


def task(args):
    n, j, lim = args
    H, phd = LOADS[j]
    phi = math.radians(phd)
    R.R47.set_tier(True)
    M1.GAPR = R43.gaps(M1, n, "braked")
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    ref = E51.ref_key(n)
    f_slack = M1.hose_f(ref, 0.0, 0.0)
    rows, checks = [], []
    for ai, e in enumerate(ERRS):
        e = np.asarray(e, float)
        _, _, er_r, _, _, _ = E55.robust_rule(ref, f_slack, e)
        for k in keys:
            lk, lr = lim[str(list(k))], lim[str(list(ref))]
            in51 = lk is not None and H <= lk + EPS and lr is not None and H <= lr + EPS
            row = {"pose": list(k[1:]), "axis": ai, "in51": bool(in51), "cal": er_r is not None}
            if not in51 or er_r is None:
                rows.append(row)
                continue
            f = M1.hose_f(k, H, phi)
            row["out"] = rule_all(k, ref, f, e, er_r)
            rows.append(row)
            if j < NCHECK:
                o58 = E58.rule_all(k, ref, f, e, er_r)["iso"]
                o = row["out"]["two-row"]
                a, b = o58.get("y"), o.get("y")
                checks.append({"how58": o58["how"], "how": o["how"], "mismatch": (a is None) != (b is None),
                               "d": 0.0 if (a is None or b is None) else max(abs(a - b), abs(o58["z"] - o["z"]))})
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows, "checks": checks}


def summary(res, n, c):
    s = dict(in51=0, pl=0, per_load=0, flipped=0, wtilt=0.0)
    for a in AX:
        s["w" + a], s["at" + a], s["over" + a], s["slack_" + a] = 0.0, None, 0, None
    for x in res:
        if x["robot"] != n:
            continue
        for r in x["rows"]:
            if not r["in51"]:
                continue
            s["in51"] += 1
            if "out" not in r:
                continue
            o = r["out"][c]
            if o.get("y") is None:
                continue
            s["pl"] += 1
            s["per_load"] += o["how"] == "per-load sides"
            s["flipped"] += o["flips"] > 0
            s["wtilt"] = max(s["wtilt"], o["tilt"])
            at = (r["pose"], round(x["H"], 2), round(x["phi"], 1), r["axis"])
            for i, a in enumerate(AX):
                if o[a] > s["w" + a]:
                    s["w" + a], s["at" + a] = o[a], at
                s["over" + a] += o[a] > SPEC + 1e-12
                sl = o["Y"][i] - (o[a] - o[a + "0"])
                k = "slack_" + a
                s[k] = sl if s[k] is None else min(s[k], sl)
    s["cov"] = 100.0 * s["pl"] / max(s["in51"], 1)
    return s


if __name__ == "__main__":
    procs = int(os.environ.get("M59_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B": B, "seed": SEED, "loads": LOADS,
           "depth_mm": DEPTH_CHECK * 1e3, "errs": [list(map(float, e)) for e in ERRS],
           "configs": {c: [None if math.isinf(b) else b for b in v] for c, v in CONFIGS.items()}}
    with ctx.Pool(procs) as pool:
        phis = [p for _, p in LOADS]
        L = pool.map(E58.task_limits, [(k, phis) for k in allkeys], chunksize=1)
        lims = {str(list(k)): v for k, v in L}
        jobs = [(n, j, {kk: v[j] for kk, v in lims.items()}) for n in ("g1", "h1") for j in range(N)]
        res = pool.map(task, jobs, chunksize=1)
    out["limits"] = lims
    out["runs"] = res
    print(f"# Milestone 59: the depth point in the flip bound, held-out section F ({N} loads, seed {SEED}; "
          f"spec {SPEC} mm at both points, {BH} mm per budgeted row; depth point {DEPTH_CHECK * 1e3:.1f} mm past "
          f"the nose; B = {B:.2f} N)")
    print("errors (6 random directions, seed 59): "
          + "; ".join("(" + ", ".join(f"{c:+.3f}" for c in e) + ")" for e in ERRS))
    ch = [c for x in res for c in x["checks"]]
    mm = sum(c["mismatch"] for c in ch)
    hm = sum(c["how58"] != c["how"] for c in ch)
    dmax = max((c["d"] for c in ch), default=0.0)
    print(f"check (two-row against milestone 58's rule_all 'iso', first {NCHECK} loads per robot): {len(ch)} cases, "
          f"plan/no-plan mismatches {mm}, 'how' mismatches {hm}, largest |y| or |z| difference {dmax:.1e} mm")
    print("\n## A. Rules: robot | config | in-envelope cases (m51) | planned | coverage | per-load sides | "
          "planned with a flip | worst |y| | worst |z| | worst |y_d| | worst |z_d| (mm) | over spec y, z, y_d, z_d | "
          "worst tilt mrad | smallest Y - shift (y, z, y_d, z_d)")
    S = {}
    for n in ("g1", "h1"):
        for c in CONFIGS:
            s = summary(res, n, c)
            S[f"{n} {c}"] = s
            print(f"  {n} | {c} | {s['in51']} | {s['pl']} | {s['cov']:.2f}% | {s['per_load']} | {s['flipped']} | "
                  + " | ".join(f"{s['w' + a]:.4f}" for a in AX) + " | "
                  + ", ".join(str(s["over" + a]) for a in AX) + f" | {s['wtilt']:.3f} | "
                  + ", ".join("-" if s["slack_" + a] is None else f"{s['slack_' + a]:.2e}" for a in AX))
    print("\n## A2. Where the worst depth-point residual sits: robot | config | axis | worst mm (pose, H N, phi deg, "
          "error)")
    for n in ("g1", "h1"):
        for c in CONFIGS:
            s = S[f"{n} {c}"]
            for a in ("yd", "zd"):
                print(f"  {n} | {c} | {a} | {s['w' + a]:.4f} ({s['at' + a]})")
    print("\n## B. No plan, by the joint with the largest normalised cost on the pose's sides: robot | config | "
          "none | joints (counts)")
    for n in ("g1", "h1"):
        for c in CONFIGS:
            bc, nn = {}, 0
            for x in res:
                if x["robot"] != n:
                    continue
                for r in x["rows"]:
                    if r["in51"] and "out" in r and r["out"][c]["how"] == "none":
                        nn += 1
                        kk = r["out"][c].get("bind") or "no plan"
                        bc[kk] = bc.get(kk, 0) + 1
            print(f"  {n} | {c} | {nn} | " + ", ".join(f"{k} {v}" for k, v in sorted(bc.items(), key=lambda t: -t[1])))
    print("\n## C. Hypotheses (registered in LOG.md before this run)")
    D = {}
    h = [S[f"{n} two-row"] for n in ("g1", "h1")]
    nose_ok = all(s["overy"] == 0 and s["overz"] == 0 for s in h)
    dgap = any(s["overyd"] > 0 or s["overzd"] > 0 for s in h)
    D["H232"] = nose_ok and dgap
    print(f"H232 (two-row: nose inside 0.03 mm in y and z, some case over 0.03 mm at the depth point): worst nose y "
          f"g1 {h[0]['wy']:.4f} h1 {h[1]['wy']:.4f}, z g1 {h[0]['wz']:.4f} h1 {h[1]['wz']:.4f}; depth y_d g1 "
          f"{h[0]['wyd']:.4f} h1 {h[1]['wyd']:.4f}, z_d g1 {h[0]['wzd']:.4f} h1 {h[1]['wzd']:.4f} mm; over at depth "
          f"g1 {h[0]['overyd'] + h[0]['overzd']} h1 {h[1]['overyd'] + h[1]['overzd']} -> "
          f"{'held' if D['H232'] else 'refuted'}")
    h = [S[f"{n} four-row"] for n in ("g1", "h1")]
    sl = min(s["slack_" + a] for s in h for a in AX if s["slack_" + a] is not None)
    D["H233"] = all(s["over" + a] == 0 for s in h for a in AX) and sl >= -1e-9
    print(f"H233 (four-row: every planned case inside 0.03 mm at both points, all bounds hold): worst g1 "
          + ", ".join(f"{a} {h[0]['w' + a]:.4f}" for a in AX) + "; h1 "
          + ", ".join(f"{a} {h[1]['w' + a]:.4f}" for a in AX)
          + f" mm; over {sum(s['over' + a] for s in h for a in AX)}; smallest slack {sl:.2e} mm -> "
          f"{'held' if D['H233'] else 'refuted'}")
    d = {n: S[f"{n} two-row"]["cov"] - S[f"{n} four-row"]["cov"] for n in ("g1", "h1")}
    D["H234"] = all(v <= 1.0 + 1e-12 for v in d.values())
    print(f"H234 (four-row coverage within 1.0 point of two-row): loss g1 {d['g1']:.2f} h1 {d['h1']:.2f} points -> "
          f"{'held' if D['H234'] else 'refuted'}")
    out["S"] = S
    out["D"] = D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

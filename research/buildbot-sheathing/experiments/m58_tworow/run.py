"""Milestone 58: a two-row flip bound, along the wall (y) and across it (z), each with its own budget.

Milestone 57 found that milestone 56's flip bound, which weights each joint's reachable backlash flip by its row of
the nose Jacobian along the wall only, admits knee and ankle pitch flips that move the nose 0.27 to 0.29 mm across
the wall. Here each joint's flip cost is taken through both rows of ``backlash.tool_rows`` at the nose (y and z),
over the same reachable held states (``preload.flip_cost``), giving Y_y and Y_z. For budgets (b_y, b_z) the rule:
  1. on the pose's sides choose the squeeze on milestone 38's grid over [-S, S] to minimise max(Y_y/b_y, Y_z/b_z)
     (ties: larger smallest robust arm margin, then smaller |squeeze|); accept if Y_y <= b_y and Y_z <= b_z;
  2. otherwise, if a leg joint has a non-zero cost in either row (or the pose's sides have no plan), every
     hold-side combination with its own squeeze, taking the smallest objective among those that pass;
  3. otherwise no plan.
b_z = inf is milestone 56's rule exactly (the objective is Y_y/b_y, same argmin and ties). The settled-torque
sensitivities G do not depend on the budgets, so one pass per side combination scores every budget. Section E is
held out: 48 Latin-hypercube loads (seed 58) with 6 random-direction 0.2 N errors (seed 58). Check: b_z = inf
against milestone 56's own ``weighted_rule`` on the first M58_CHECK loads of each robot. Hypotheses H229-H231
(LOG.md, registered before the run). M58_PROCS sets the pool (default 4); M58_N the loads (default 48).
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
N = int(os.environ.get("M58_N", "48"))
NCHECK = int(os.environ.get("M58_CHECK", "4"))
os.environ["M56_N"] = str(N)
os.environ["M56_BETA"] = "0.5"
spec = importlib.util.spec_from_file_location("m56", os.path.join(HERE, "..", "m56_weighted", "run.py"))
E56 = importlib.util.module_from_spec(spec)
sys.modules["m56"] = E56
spec.loader.exec_module(E56)                     # milestone 56's object (and so 55's, ... 38's)
E55, E54, E53, E52, E51 = E56.E55, E56.E54, E56.E53, E56.E52, E56.E51
R, M1, R45, R43 = E56.R, E56.M1, E56.R45, E56.R43
SPEC, B, EPS = E56.SPEC, E56.B, E56.EPS
PLM, BL = E56.PLM, E56.BL
BETA = 0.5
BY = BETA * SPEC                                  # mm, the flip budget along the wall (milestone 56)
# z budgets: none (milestone 56), isotropic (z spec = y spec, 0.03 mm) and loose (z spec 0.3 mm, reported only)
CONFIGS = {"y-only": (BY, math.inf, SPEC), "iso": (BY, BETA * SPEC, SPEC), "loose": (BY, BETA * 0.3, 0.3)}
SEED = 58
LOADS = E54.lhs(N, SEED)
ERRS = [B * a for a in E55.rand_dirs(6, SEED)]
UNIT = np.eye(3)


def rows_yz(key):
    """Nose displacement along (y) and across (z) the wall per radian of each joint's error, mm/rad."""
    jp, jr = M1.POSE[key].rows[:2]
    T = BL.tool_rows(jp, jr, np.array([M1.L0, 0.0, 0.0])) / M1.MM
    return T[1], T[2]


def plans(key, fm, S=None):
    """Plans on the current hold sides for every config: {name: None or dict(Yy, Yz, obj, pass, s, pf, tp, a,
    legcost, bind)}. Mirrors ``m56.weighted`` with the objective max(Yy/by, Yz/bz)."""
    S = R45.S_STAR if S is None else S
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
    wy, wz = rows_yz(key)
    arms = np.asarray(M1.ARMS[key], int)
    lim = np.maximum(M1.LIM[n], np.maximum(np.abs(tp_raw[0]), np.abs(tp_raw[1])))
    step = 0.05
    k = int(round(S / step)) if S > 0 else 0
    cand = []
    for s in np.linspace(-k * step, k * step, 2 * k + 1):
        T = [t + a * s for t in tp_raw]
        if len(arms) and not all(np.all(np.abs(T[w][arms]) <= lim[arms]) for w in range(2)):
            continue
        cy = PLM.flip_cost(T[0], T[1], r[0], r[1], M1.TAUF, M1.GAPR, wy)
        cz = PLM.flip_cost(T[0], T[1], r[0], r[1], M1.TAUF, M1.GAPR, wz)
        marg = (min(float(np.min(np.abs(np.abs(T[w][arms]) - M1.TAUF) - r[w][arms])) for w in range(2))
                if len(arms) else 0.0)
        cand.append((float(s), T, cy, cz, marg))
    legs = set(int(x) for x in M1.ROB[n][2])
    names = M1.ROB[n][1]
    out = {}
    for cname, (by, bz, _) in CONFIGS.items():
        best = None
        for s, T, cy, cz, marg in cand:
            Yy, Yz = float(np.sum(cy)), float(np.sum(cz))
            obj = max(Yy / by, 0.0 if math.isinf(bz) else Yz / bz)
            kk = (obj, -marg, abs(s))
            if best is None or kk < best[0]:
                best = (kk, s, T, cy, cz, Yy, Yz, obj)
        if best is None:
            out[cname] = None
            continue
        _, s, T, cy, cz, Yy, Yz, obj = best
        zc = math.isfinite(bz)
        cost = cy / by + (cz / bz if zc else 0.0)
        out[cname] = {"Yy": Yy, "Yz": Yz, "obj": obj, "pass": Yy <= by + 1e-12 and (not zc or Yz <= bz + 1e-12),
                      "s": s, "pf": pf, "tp": T, "a": a, "bind": names[int(np.argmax(cost))],
                      "legcost": any(cy[j] > 0 or (zc and cz[j] > 0) for j in legs)}
    return out


def resid(key, ref, rp, f, er_r):
    """(|y|, |y| with the plan's held states, |z|, |z| with the plan's held states, flips) in mm."""
    ep, enf, fl = E56.robot_err(key, f, rp)
    rows, rr = M1.POSE[key].rows[:2], M1.POSE[ref].rows[:2]
    c = M1.C.compensated(rows, rr, ep, er_r, M1.L0)
    c0 = M1.C.compensated(rows, rr, enf, er_r, M1.L0)
    return (abs(c["y"][0]) / M1.MM, abs(c0["y"][0]) / M1.MM, abs(c["z"][0]) / M1.MM, abs(c0["z"][0]) / M1.MM,
            int(fl))


def slim(p, r):
    return {"Yy": p["Yy"], "Yz": p["Yz"], "bind": p["bind"], "y": r[0], "y0": r[1], "z": r[2], "z0": r[3],
            "flips": r[4]}


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


def task_limits(args):
    key, phis = args
    R.R47.set_tier(True)
    return key, [E54.limit(key, math.radians(p)) for p in phis]


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
                how56, _, ep, _, _, _, _ = E56.weighted_rule(k, f, e)
                y56 = None if ep is None else E52.y_mm(k, ref, ep, er_r)
                o = row["out"]["y-only"]
                mine = o.get("y")
                checks.append({"how56": how56, "how": o["how"], "mismatch": (y56 is None) != (mine is None),
                               "dy": 0.0 if (y56 is None or mine is None) else abs(y56 - mine)})
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows, "checks": checks}


def summary(res, n, c):
    zs = CONFIGS[c][2]
    s = dict(in51=0, pl=0, wy=0.0, aty=None, wz=0.0, atz=None, overy=0, overz=0, slack_y=None, slack_z=None,
             per_load=0, flipped=0)
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
            at = (r["pose"], round(x["H"], 2), round(x["phi"], 1), r["axis"])
            if o["y"] > s["wy"]:
                s["wy"], s["aty"] = o["y"], at
            if o["z"] > s["wz"]:
                s["wz"], s["atz"] = o["z"], at
            s["overy"] += o["y"] > SPEC + 1e-12
            s["overz"] += o["z"] > zs + 1e-12
            for ax in ("y", "z"):
                sl = o["Y" + ax] - (o[ax] - o[ax + "0"])
                k = "slack_" + ax
                s[k] = sl if s[k] is None else min(s[k], sl)
    s["cov"] = 100.0 * s["pl"] / max(s["in51"], 1)
    return s


if __name__ == "__main__":
    procs = int(os.environ.get("M58_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B": B, "seed": SEED, "loads": LOADS,
           "errs": [list(map(float, e)) for e in ERRS],
           "configs": {c: [v[0], None if math.isinf(v[1]) else v[1], v[2]] for c, v in CONFIGS.items()}}
    with ctx.Pool(procs) as pool:
        phis = [p for _, p in LOADS]
        L = pool.map(task_limits, [(k, phis) for k in allkeys], chunksize=1)
        lims = {str(list(k)): v for k, v in L}
        jobs = [(n, j, {kk: v[j] for kk, v in lims.items()}) for n in ("g1", "h1") for j in range(N)]
        res = pool.map(task, jobs, chunksize=1)
    out["limits"] = lims
    out["runs"] = res
    print(f"# Milestone 58: a two-row (y and z) flip bound, held-out section E ({N} loads, seed {SEED}; "
          f"y spec {SPEC} mm, b_y = {BY} mm; B = {B:.2f} N)")
    print("errors (6 random directions, seed 58): "
          + "; ".join("(" + ", ".join(f"{c:+.3f}" for c in e) + ")" for e in ERRS))
    ch = [c for x in res for c in x["checks"]]
    mm = sum(c["mismatch"] for c in ch)
    hm = sum(c["how56"] != c["how"] for c in ch)
    dmax = max((c["dy"] for c in ch), default=0.0)
    print(f"check (b_z = inf against milestone 56's weighted_rule, first {NCHECK} loads per robot): {len(ch)} cases, "
          f"plan/no-plan mismatches {mm}, 'how' mismatches {hm}, largest |y| difference {dmax:.1e} mm")
    print("\n## A. Rules: robot | config (b_y, b_z mm; z spec) | in-envelope cases (m51) | planned | coverage | "
          "per-load sides | planned with a flip | worst |y| mm (at) | over y spec | worst |z| mm (at) | over z spec | "
          "smallest Y_y - y shift | smallest Y_z - z shift")
    S = {}
    for n in ("g1", "h1"):
        for c, (by, bz, zs) in CONFIGS.items():
            s = summary(res, n, c)
            S[f"{n} {c}"] = s
            print(f"  {n} | {c} ({by:.3f}, {'inf' if math.isinf(bz) else f'{bz:.3f}'}; {zs}) | {s['in51']} | "
                  f"{s['pl']} | {s['cov']:.2f}% | {s['per_load']} | {s['flipped']} | {s['wy']:.4f} ({s['aty']}) | "
                  f"{s['overy']} | {s['wz']:.4f} ({s['atz']}) | {s['overz']} | "
                  + " | ".join("-" if s[k] is None else f"{s[k]:.2e}" for k in ("slack_y", "slack_z")))
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
    h = [S[f"{n} iso"] for n in ("g1", "h1")]
    sly = min(s["slack_y"] for s in h if s["slack_y"] is not None)
    slz = min(s["slack_z"] for s in h if s["slack_z"] is not None)
    D["H229"] = all(s["overy"] == 0 and s["overz"] == 0 for s in h) and sly >= -1e-9 and slz >= -1e-9
    print(f"H229 (isotropic: every planned case inside 0.03 mm in y and z, both bounds hold): worst y g1 "
          f"{h[0]['wy']:.4f} h1 {h[1]['wy']:.4f}, worst z g1 {h[0]['wz']:.4f} h1 {h[1]['wz']:.4f} mm; over z g1 "
          f"{h[0]['overz']} h1 {h[1]['overz']}; smallest slack y {sly:.2e} z {slz:.2e} mm -> "
          f"{'held' if D['H229'] else 'refuted'}")
    d = {n: S[f"{n} y-only"]["cov"] - S[f"{n} iso"]["cov"] for n in ("g1", "h1")}
    D["H230"] = all(v <= 1.0 + 1e-12 for v in d.values())
    print(f"H230 (isotropic coverage within 1.0 point of y-only): loss g1 {d['g1']:.2f} h1 {d['h1']:.2f} points -> "
          f"{'held' if D['H230'] else 'refuted'}")
    h = [S[f"{n} y-only"] for n in ("g1", "h1")]
    D["H231"] = all(s["overy"] == 0 for s in h) and any(s["wz"] > SPEC + 1e-12 for s in h)
    print(f"H231 (y-only: inside 0.03 mm in y, some case over 0.03 mm in z): worst y g1 {h[0]['wy']:.4f} h1 "
          f"{h[1]['wy']:.4f}, worst z g1 {h[0]['wz']:.4f} h1 {h[1]['wz']:.4f} mm -> "
          f"{'held' if D['H231'] else 'refuted'}")
    out["S"] = S
    out["D"] = D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

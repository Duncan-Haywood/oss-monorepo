"""Milestone 57: sweep the budget share beta of milestone 56's flip-cost-weighted rule on a held-out seed.

Milestone 56's rule (its run imported unchanged) picks, from the measured load, the squeeze that minimises the flip
bound Y on the pose's sides and accepts if Y <= beta * SPEC; else, if a leg joint has a cost (or the pose's sides have
no plan), it searches every hold-side combination and takes the smallest Y among those that pass; else no plan. The
squeeze choice does not depend on beta, and the smallest-Y passing combination is the smallest-Y combination when it
passes, so one pass per case (pose-side plan, smallest-Y combination) gives the plan at every beta. Section D is held
out: 48 Latin-hypercube loads (seed 57) with 6 random-direction 0.2 N errors (seed 57). Check: at beta = 0.5, on
the first M57_CHECK loads of each robot, milestone 56's own ``weighted_rule`` must agree. Hypotheses H226-H228
(LOG.md, registered before the run). M57_PROCS sets the pool (default 4); M57_N the loads (default 48).
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
N = int(os.environ.get("M57_N", "48"))
NCHECK = int(os.environ.get("M57_CHECK", "4"))
os.environ["M56_N"] = str(N)
os.environ["M56_BETA"] = "0.5"
spec = importlib.util.spec_from_file_location("m56", os.path.join(HERE, "..", "m56_weighted", "run.py"))
E56 = importlib.util.module_from_spec(spec)
sys.modules["m56"] = E56
spec.loader.exec_module(E56)                     # milestone 56's object (and so 55's, ... 38's)
E55, E54, E53, E52, E51 = E56.E55, E56.E54, E56.E53, E56.E52, E56.E51
R, M1, R43 = E56.R, E56.M1, E56.R43
SPEC, B, EPS = E56.SPEC, E56.B, E56.EPS
from buildbot_sheathing.pose_range import held_bias  # noqa: E402
BETAS = (0.0, 0.25, 0.5, 0.75, 1.0)
SEED = 57
LOADS = E54.lhs(N, SEED)
ERRS = [B * a for a in E55.rand_dirs(6, SEED)]


def resid(key, ref, rp, f, er_r):
    """(|y|, |y| with the plan's held states, |z|, flips) in mm when the robot runs plan rp under load f."""
    ep, enf, fl = E56.robot_err(key, f, rp)
    c = M1.C.compensated(M1.POSE[key].rows[:2], M1.POSE[ref].rows[:2], ep, er_r, M1.L0)
    return (abs(c["y"][0]) / M1.MM, E52.y_mm(key, ref, enf, er_r), abs(c["z"][0]) / M1.MM, int(fl))


def one_pass(key, ref, f, e, er_r):
    """Everything the rule needs at every beta: the pose-side plan and the smallest-Y side combination."""
    fm = np.asarray(f, float) + np.asarray(e, float)
    rp = E56.weighted(key, fm)
    pose = None if rp is None else {"Y": rp["Y"], "bind": rp["bind"], "nband": rp["nband"],
                                    "legcost": bool(rp["legcost"])}
    if rp is not None:
        pose["r"] = resid(key, ref, rp, f, er_r)
    search = rp is None or (rp["legcost"] and rp["Y"] > 1e-12)
    comb = None
    if search:
        s0 = E53.sides(key)
        for c in itertools.product((-1.0, 1.0), repeat=len(s0)):
            sv = np.array(c)

            def go():
                q = E56.weighted(key, fm)
                return None if q is None else (q, resid(key, ref, q, f, er_r))
            res = E55.with_sides(key, sv, go)
            if res is None:
                continue
            if comb is None or res[0]["Y"] < comb["Y"] - 1e-12:
                comb = {"Y": res[0]["Y"], "r": res[1], "sides": [int(x) for x in sv]}
    return pose, comb


def at_beta(pose, comb, beta):
    """The rule's outcome at budget share beta: (how, Y, residuals) or ("none", ...)."""
    bud = beta * SPEC + 1e-12
    if pose is not None and pose["Y"] <= bud:
        return "pose sides", pose["Y"], pose["r"]
    if pose is not None and not (pose["legcost"] and pose["Y"] > 1e-12):
        return "none", None, None
    if comb is not None and comb["Y"] <= bud:
        return "per-load sides", comb["Y"], comb["r"]
    return "none", None, None


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
            in_pose = lk is not None and H <= lk + EPS
            in51 = in_pose and lr is not None and H <= lr + EPS
            row = {"pose": list(k[1:]), "axis": ai, "in51": bool(in51), "cal": er_r is not None}
            if not in51 or er_r is None:
                rows.append(row)
                continue
            f = M1.hose_f(k, H, phi)
            pose, comb = one_pass(k, ref, f, e, er_r)
            row["out"] = {}
            for b in BETAS:
                how, Y, r = at_beta(pose, comb, b)
                row["out"][str(b)] = {"how": how, "Y": Y, "y": None if r is None else r[0],
                                      "y_noflip": None if r is None else r[1], "z": None if r is None else r[2],
                                      "flips": None if r is None else r[3]}
            row["bind"] = None if pose is None else pose["bind"]
            rows.append(row)
            if j < NCHECK:
                how56, _, ep, _, _, _, _ = E56.weighted_rule(k, f, e)
                y56 = None if ep is None else E52.y_mm(k, ref, ep, er_r)
                mine = row["out"]["0.5"]["y"]
                checks.append({"pose": list(k[1:]), "axis": ai, "how56": how56, "how": row["out"]["0.5"]["how"],
                               "dy": None if (y56 is None) != (mine is None) else
                               (0.0 if y56 is None else abs(y56 - mine)), "mismatch": (y56 is None) != (mine is None)})
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows, "checks": checks}


def summary(res, n, b):
    s = dict(in51=0, pl=0, w=0.0, at=None, over=0, zw=0.0, slack=None, flipped=0, per_load=0)
    for x in res:
        if x["robot"] != n:
            continue
        for r in x["rows"]:
            if not r["in51"]:
                continue
            s["in51"] += 1
            if "out" not in r:
                continue
            o = r["out"][str(b)]
            if o["y"] is None:
                continue
            s["pl"] += 1
            s["per_load"] += o["how"] == "per-load sides"
            if o["y"] > s["w"]:
                s["w"], s["at"] = o["y"], (r["pose"], round(x["H"], 2), round(x["phi"], 1), r["axis"])
            s["over"] += o["y"] > SPEC
            s["zw"] = max(s["zw"], o["z"])
            s["flipped"] += (o["flips"] or 0) > 0
            sl = o["Y"] - (o["y"] - o["y_noflip"])
            s["slack"] = sl if s["slack"] is None else min(s["slack"], sl)
    s["cov"] = 100.0 * s["pl"] / max(s["in51"], 1)
    return s


if __name__ == "__main__":
    procs = int(os.environ.get("M57_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B": B, "betas": BETAS, "seed": SEED,
           "loads": LOADS, "errs": [list(map(float, e)) for e in ERRS]}
    with ctx.Pool(procs) as pool:
        phis = [p for _, p in LOADS]
        L = pool.map(task_limits, [(k, phis) for k in allkeys], chunksize=1)
        lims = {str(list(k)): v for k, v in L}
        jobs = [(n, j, {kk: v[j] for kk, v in lims.items()}) for n in ("g1", "h1") for j in range(N)]
        res = pool.map(task, jobs, chunksize=1)
    out["limits"] = lims
    out["runs"] = res
    print(f"# Milestone 57: the budget share beta of milestone 56's weighted rule, held-out section D "
          f"({N} loads, seed {SEED}; spec {SPEC} mm; B = {B:.2f} N)")
    print("errors (6 random directions, seed 57): "
          + "; ".join("(" + ", ".join(f"{c:+.3f}" for c in e) + ")" for e in ERRS))
    ch = [c for x in res for c in x["checks"]]
    mm = sum(c["mismatch"] for c in ch)
    dmax = max((c["dy"] for c in ch if c["dy"] is not None), default=0.0)
    hm = sum(c["how56"] != c["how"] for c in ch)
    print(f"check (beta 0.5, first {NCHECK} loads per robot, against milestone 56's weighted_rule): {len(ch)} cases, "
          f"plan/no-plan mismatches {mm}, 'how' mismatches {hm}, largest |y| difference {dmax:.1e} mm")
    print("\n## A. Frontier: robot | beta | budget mm | in-envelope cases (m51) | planned | coverage | per-load sides | "
          "worst |y| mm (at pose, H, phi, error) | over spec | worst |z| mm | planned with a flip | smallest (Y - shift) mm")
    S = {}
    for n in ("g1", "h1"):
        for b in BETAS:
            s = summary(res, n, b)
            S[f"{n} {b}"] = s
            print(f"  {n} | {b:.2f} | {b * SPEC:.4f} | {s['in51']} | {s['pl']} | {s['cov']:.2f}% | {s['per_load']} | "
                  f"{s['w']:.4f} ({s['at']}) | {s['over']} | {s['zw']:.4f} | {s['flipped']} | "
                  + ("-" if s["slack"] is None else f"{s['slack']:.2e}"))
    print("\n## B. Still no plan at each beta, by the joint with the largest cost on the pose's sides: robot | beta | "
          "none | joints (counts)")
    for n in ("g1", "h1"):
        for b in BETAS:
            bc, nn = {}, 0
            for x in res:
                if x["robot"] != n:
                    continue
                for r in x["rows"]:
                    if r["in51"] and "out" in r and r["out"][str(b)]["how"] == "none":
                        nn += 1
                        k = r["bind"] or "no plan"
                        bc[k] = bc.get(k, 0) + 1
            print(f"  {n} | {b:.2f} | {nn} | " + ", ".join(f"{k} {v}" for k, v in sorted(bc.items(), key=lambda t: -t[1])))
    print("\n## C. Hypotheses (registered in LOG.md before this run)")
    D = {}
    h = [S[f"{n} 0.5"] for n in ("g1", "h1")]
    sl = min(s["slack"] for s in h if s["slack"] is not None)
    D["H226"] = all(s["w"] <= SPEC + 1e-12 and s["cov"] >= 99.0 for s in h) and sl >= -1e-9
    print(f"H226 (beta 0.5: spec, coverage >= 99%, bound): worst g1 {h[0]['w']:.4f} h1 {h[1]['w']:.4f} mm; coverage "
          f"g1 {h[0]['cov']:.2f}% h1 {h[1]['cov']:.2f}%; smallest Y - shift {sl:.2e} mm -> "
          f"{'held' if D['H226'] else 'refuted'}")
    h = [S[f"{n} 1.0"] for n in ("g1", "h1")]
    D["H227"] = all(s["w"] <= SPEC + 1e-12 for s in h)
    print(f"H227 (beta 1.0: every planned case inside {SPEC} mm): worst g1 {h[0]['w']:.4f} h1 {h[1]['w']:.4f} mm, "
          f"over spec g1 {h[0]['over']} h1 {h[1]['over']} -> {'held' if D['H227'] else 'refuted'}")
    d = {n: S[f"{n} 0.5"]["cov"] - S[f"{n} 0.25"]["cov"] for n in ("g1", "h1")}
    D["H228"] = all(v <= 0.5 + 1e-12 for v in d.values())
    print(f"H228 (coverage at 0.25 within 0.5 points of 0.5): loss g1 {d['g1']:.2f} h1 {d['h1']:.2f} points -> "
          f"{'held' if D['H228'] else 'refuted'}")
    out["S"] = S
    out["D"] = D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

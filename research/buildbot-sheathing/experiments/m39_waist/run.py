"""Milestone 39: the waist's gap, from stock to braked (milestone 38 left its floor in the waist).

Milestone 38's setup at its S* = 10 N squeeze and m = 0.1 N m leg preload (settle model, rubber hose, k_t 1e4,
one calibration at milestone 30's pose in the same hose state and sensor error), imported from
``../m38_squeeze/run.py`` so every pose, plan and residual is the same code. New: the total backlash gap is set
per joint. Waist cases: 'stock' (5 arcmin everywhere, milestone 38), 'yaw only' (G1: waist roll and pitch rigid
at the posed angle, as on the one-waist-joint G1; unitree.com/g1), 'precision' (1 arcmin on the waist, the low
end of catalogue precision planetaries) and 'braked' (0 on the waist). Every other joint keeps 5 arcmin.
The torques, and so milestone 38's flip census, do not depend on the gap; what a flip costs does.

B. Worst residual per case, |e| 0.2 and 2.4 N, H 0, 5, 20 N. D. Stacks over 0-H_max with the FT 300's noise
and the no-hose stack the loss is counted from. E. Hypotheses H146-H150 (registered in LOG.md before the run).
M39_SMOKE=1 runs a fast code check (its numbers are not results); M39_PROCS sets the pool (default 4).
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
if os.environ.get("M39_SMOKE"):
    os.environ["M38_SMOKE"] = "1"
spec = importlib.util.spec_from_file_location("m38", os.path.join(HERE, "..", "m38_squeeze", "run.py"))
M = importlib.util.module_from_spec(spec)
sys.modules["m38"] = M
print("(milestone 38's setup, imported:)")
spec.loader.exec_module(M)                       # builds poses, plans and checks; its __main__ block does not run
print()
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import waist as WA  # noqa: E402

T0 = time.time()
m38 = json.load(open(os.path.join(HERE, "..", "m38_squeeze", "results.json")))
S_STAR = float(m38["S_star"])                    # 10 N
GAP = M.GAPR                                     # 5 arcmin, the registered case since milestone 30
CASES = {"g1": ["stock", "yaw only", "precision", "braked"], "h1": ["stock", "precision", "braked"]}
WAIST_GAP = {"precision": 1 * M.AM, "braked": 0.0}


def waist_idx(n):
    names = M.ROB[n][1]
    return [j for j in range(len(names)) if M.kind(n, j) == "waist"]


def gaps(n, case):
    """Per-joint total gap (rad) for robot n under a waist case."""
    return WA.case_gaps(M.ROB[n][1], waist_idx(n), GAP, case, WAIST_GAP["precision"])


def task_B(args):
    n, case = args
    M.GAPR = gaps(n, case)
    r = M.task_B((n, S_STAR))
    return {"n": n, "case": case, "rows": r["rows"], "s": r["s"]}


def task_D(args):
    n, hm, phi, case = args
    M.GAPR = gaps(n, case)
    r = M.task_D((n, hm, phi, S_STAR))
    v0 = {k: M.V(k) for k in M.KEYS if k[0] == n}
    r.update({"case": case, "v0_min": min(v0.values()), "v0_max": max(v0.values()),
              "v0_ref": v0[(n,) + M.REF]})
    return r


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__},
           "S": S_STAR, "m_leg": M.M_LEG, "gap_arcmin": GAP / M.AM, "cases": CASES,
           "waist_gap_arcmin": {k: v / M.AM for k, v in WAIST_GAP.items()}}
    print("# Milestone 39: the waist's gap, from stock to braked")
    for n in M.ROB:
        names = M.ROB[n][1]
        wi = waist_idx(n)
        q = {k: M.POSE[k].qpos for k in M.KEYS if k[0] == n}
        r = M.ROB[n][0]
        adr = [r.model.jnt_qposadr[r.model.joint(names[j]).id] for j in wi]
        ang = {names[j]: (float(min(np.degrees(v[a]) for v in q.values())),
                          float(max(np.degrees(v[a]) for v in q.values()))) for j, a in zip(wi, adr)}
        out.setdefault("waist_angles_deg", {})[n] = ang
        moving = sum(1 for k in M.KEYS if k[0] == n for j in wi if M.POSE[k].rows[2][j])
        print(f"{n}: waist joints {', '.join(names[j] for j in wi)}; posed angles (deg) "
              + "; ".join(f"{a} {lo:.1f} to {hi:.1f}" for a, (lo, hi) in ang.items())
              + f"; nose-moving waist joint-poses {moving}")
    for n in M.ROB:
        for case in CASES[n]:
            g = gaps(n, case)
            print(f"  {n} {case:9s}: waist gaps (arcmin) "
                  + ", ".join(f"{g[j] / M.AM:g}" for j in waist_idx(n))
                  + f"; other joints {sorted({round(g[j] / M.AM, 6) for j in range(len(g)) if j not in waist_idx(n)})}")
    print()

    procs = int(os.environ.get("M39_PROCS", "4"))
    ctx = M.mp.get_context("fork")
    jobs = [(n, c) for n in ("h1", "g1") for c in CASES[n]]
    with ctx.Pool(procs) as pool:
        resB = pool.map(task_B, jobs, chunksize=1)
    out["B"] = [dict(r, case=x["case"]) for x in resB for r in x["rows"]]
    print("(section B tasks: " + ", ".join(f"{x['n']} {x['case']} {x['s']:.0f} s" for x in resB) + ")")
    print()

    def row(n, case, H, b):
        return [r for r in out["B"] if r["robot"] == n and r["case"] == case and r["H"] == H and r["b"] == b][0]

    def m38row(n, H, b):
        x = [r for r in m38["B"] if r["robot"] == n and r["S"] == S_STAR and r["H"] == H and r["b"] == b]
        return abs(x[0]["worst"]["y"]) if x and x[0]["worst"] else None

    print(f"## B. Worst residual along the wall |y| (and the worst |z|) in mm over poses, directions and signed axes, "
          f"S {S_STAR:g} N, m {M.M_LEG:g} N m: robot | H | |e| | case ... | (milestone 38, S {S_STAR:g})")
    out["check_stock"] = 0.0
    for n in M.ROB:
        print(f"  {n}: " + " / ".join(CASES[n]))
        for H in M.HB:
            for b in M.BS:
                ys = []
                for c in CASES[n]:
                    w = row(n, c, H, b)["worst"]
                    ys.append("none" if w is None else f"{abs(w['y']) / M.MM:.3f} ({w.get('z', 0) / M.MM:.3f})")
                ref = m38row(n, H, b)
                w0 = row(n, "stock", H, b)["worst"]
                if ref is not None and w0 is not None:
                    out["check_stock"] = max(out["check_stock"], abs(abs(w0["y"]) - ref))
                print(f"  {n} {H:5.1f} {b:4.1f} | " + " / ".join(ys)
                      + f"   ({'-' if ref is None else f'{ref / M.MM:.3f}'})")
    print(f"check: 'stock' reproduces milestone 38's S {S_STAR:g} residuals to {out['check_stock'] / M.MM:.1e} mm "
          "(expect 0)")
    print()

    jobs = []
    for n in M.ROB:
        for d35 in [x for x in M.m35["D"] if x["robot"] == n and x["H_max"] in (10.0, 20.0)]:
            for c in CASES[n]:
                jobs.append((n, d35["H_max"], d35["phi"], c))
    with ctx.Pool(procs) as pool:
        out["D"] = pool.map(task_D, jobs, chunksize=1)
    print(f"## D. Stack loss (points), H uniform over [0, H_max] in milestone 35's worst direction, FT 300 noise per "
          f"shot, |e| 0.2 N bias at H_max / 2, S {S_STAR:g} N, m {M.M_LEG:g}: robot | H_max | case | loss | at | "
          "no-hose stack min-max over poses (at milestone 30's pose)  (milestone 38)")
    for r in out["D"]:
        c38 = [x for x in m38["D"] if x["robot"] == r["robot"] and x["H_max"] == r["H_max"] and x["S"] == S_STAR]
        print(f"  {r['robot']} {r['H_max']:5.1f} | {r['case']:9s} | {100 * r['worst_loss']:6.2f} | at {r['at']} | "
              f"{r['v0_min']:.4f}-{r['v0_max']:.4f} ({r['v0_ref']:.4f})"
              + (f"  ({100 * c38[0]['worst_loss']:.2f})" if c38 and r["case"] == "stock" else ""))
    print()

    print("## E. Hypotheses (registered in LOG.md before this run)")
    E = {}
    try:
        y = {c: abs(row("g1", c, 5.0, 0.2)["worst"]["y"]) / M.MM for c in CASES["g1"]}
        E["H146"] = y["braked"] <= 0.1
        print(f"H146 (braked, |e| 0.2, 5 N: G1 <= 0.1 mm; milestone 38 0.485): {y['braked']:.3f} mm -> "
              f"{'held' if E['H146'] else 'refuted'}")
        E["H147"] = y["yaw only"] >= 0.5 * y["stock"]
        print(f"H147 (yaw only keeps at least half of stock {y['stock']:.3f} mm): {y['yaw only']:.3f} mm -> "
              f"{'held' if E['H147'] else 'refuted'}")
        E["H148"] = y["precision"] <= 0.15
        print(f"H148 (precision 1 arcmin: G1 <= 0.15 mm): {y['precision']:.3f} mm -> "
              f"{'held' if E['H148'] else 'refuted'}")
    except (IndexError, TypeError):
        print("H146-H148: cells missing (smoke run?)")
    db = [r for r in out["D"] if r["case"] == "braked"]
    g10 = [r for r in db if r["robot"] == "g1" and r["H_max"] == 10.0]
    rest = [r for r in db if not (r["robot"] == "g1" and r["H_max"] == 10.0)]
    if g10:
        E["H149"] = 100 * g10[0]["worst_loss"] <= 1.0 and all(100 * r["worst_loss"] <= 0.1 for r in rest)
        print(f"H149 (braked: G1 0-10 N <= 1 point, the rest <= 0.1): G1 0-10 {100 * g10[0]['worst_loss']:.2f}; rest "
              + ", ".join(f"{r['robot']} 0-{r['H_max']:g} {100 * r['worst_loss']:.2f}" for r in rest)
              + f" -> {'held' if E['H149'] else 'refuted'}")
    try:
        y24 = abs(row("g1", "braked", 5.0, 2.4)["worst"]["y"]) / M.MM
        E["H150"] = y24 > 0.5
        print(f"H150 (braked, |e| 2.4, 5 N: G1 > 0.5 mm): {y24:.3f} mm -> {'held' if E['H150'] else 'refuted'}")
    except (IndexError, TypeError):
        print("H150: cell missing")
    out["E"] = E
    if not os.environ.get("M39_SMOKE"):
        json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(f"\n(run time {time.time() - T0:.0f} s after the import; python {platform.python_version()}, "
          f"numpy {np.__version__}, mujoco {M.mujoco.__version__})")

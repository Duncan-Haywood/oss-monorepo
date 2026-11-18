"""Milestone 54: the three hose rules off the 8-direction grid (Latin-hypercube hose loads), and the drag envelope
between grid directions.

Milestones 50 to 53 sampled hose drag at 0 / 5 / 20 N in 8 directions, and bisected each pose's drag limit at those 8
directions only. Here (milestone 53's run imported unchanged: milestone 48's sides, 'braked' gaps, |e| 0.2 N on the
6 sensor axes, S 10 N, slack calibration, per-load side rule):
A. The drag limit at every sampled direction, bisected as milestone 50 did (largest H in [0, 60] N at which both
   25 and 50 N balance, current lean, 25 steps), against the grid read by the smaller neighbouring direction; a
   check that the same bisection at the 8 grid directions reproduces milestone 50's limits.
B. 48 Latin-hypercube loads (H in [0, 20] N, phi in [0, 360) deg, seed 54; the same for both robots) x 6 sensor
   axes x every pose: plan on the pose's sides; if none and the load is inside the pose's limit, milestone 53's
   per-load side search (outside it the case is reported, not searched); residual along the
   wall with the slack calibration. Coverage and worst residual inside milestone 51's envelope (H at most the
   limit at the pose and the calibration pose, at the sampled phi) and inside the pose-only one.
C. Hypotheses H217-H219 (LOG.md, registered before the run). M54_PROCS sets the pool (default 4); M54_N the
   number of LHS loads (default 48).
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
spec = importlib.util.spec_from_file_location("m53", os.path.join(HERE, "..", "m53_loadside", "run.py"))
E53 = importlib.util.module_from_spec(spec)
sys.modules["m53"] = E53
spec.loader.exec_module(E53)                     # milestone 53's object (and so 52's, 51's, 48's sides, ... 38's)
E52, E51, R, M1, R45, R43 = E53.E52, E53.E51, E53.R, E53.M1, E53.R45, E53.R43
GQ0 = E53.GQ0
SPEC = E53.SPEC
EPS = 1e-9
HMAX = 60.0                                      # milestone 50's bisection range, N
HLHS = 20.0                                      # the largest drag milestones 44 to 53 swept, N
N_LHS = int(os.environ.get("M54_N", "48"))
SEED = 54
GRID = [round(math.degrees(p)) for p in M1.PHIS]   # 0, 45, ..., 315


def lhs(n, seed):
    """n Latin-hypercube points on [0, HLHS] x [0, 360): one point per stratum on each axis, strata paired at random."""
    rng = np.random.default_rng(seed)
    u = (rng.permutation(n) + rng.random(n)) / n
    v = (rng.permutation(n) + rng.random(n)) / n
    return [(float(HLHS * a), float(360.0 * b)) for a, b in zip(u, v)]


LOADS = lhs(N_LHS, SEED)


def ok_at(r, q, key, H, phi):
    """Milestone 50's test: 25 and 50 N both balance (balance-and-cones LP) under hose tension H in direction phi."""
    fh = np.asarray(M1.hose_f(key, H, phi), float)
    return all(GQ0.margin_lp(M1.contact(r, q, F, M1.TOOL_KG, fh), [], [])[1] is not None
               for F in (M1.F_HI / 2, M1.F_HI))


def limit(key, phi):
    """Milestone 50's bisection of the largest tolerated drag at direction phi (rad); None if 0 N fails."""
    r = M1.ROB[key[0]][0]
    q = M1.POSE[key].qpos
    bal = lambda H: ok_at(r, q, key, H, phi)  # noqa: E731
    if not bal(0.0):
        return None
    if bal(HMAX):
        return HMAX
    a, b = 0.0, HMAX
    for _ in range(25):
        m = (a + b) / 2
        a, b = (m, b) if bal(m) else (a, m)
    return a


def grid_tol(key, i):
    t = E51.tol(key, i)
    if t is None:
        return None
    return t[0] if isinstance(t, (list, tuple)) else t


def grid_min(key, phd):
    """The grid read by the smaller of the two neighbouring grid directions (None if either has no limit)."""
    i = int(phd // 45) % 8
    a, b = grid_tol(key, i), grid_tol(key, (i + 1) % 8)
    return None if a is None or b is None else min(a, b)


def task_limits(key):
    """Drag limit at the 8 grid directions (reproduction check) and at every LHS direction."""
    R.R47.set_tier(True)
    g = [limit(key, M1.PHIS[i]) for i in range(8)]
    s = [limit(key, math.radians(phd)) for _, phd in LOADS]
    return key, g, s


def task(args):
    n, j, lim = args
    H, phd = LOADS[j]
    phi = math.radians(phd)
    R.R47.set_tier(True)
    M1.GAPR = R43.gaps(M1, n, "braked")
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    ref = E51.ref_key(n)
    f_slack = M1.hose_f(ref, 0.0, 0.0)
    rows = []
    for ai, a in enumerate(M1.AXES):
        e = R45.B_E * a
        er = M1.joint_err(ref, f_slack, e, R45.S_STAR)        # slack calibration
        for k in keys:
            lk, lr = lim[str(list(k))], lim[str(list(ref))]
            in_pose = lk is not None and H <= lk + EPS
            in51 = in_pose and lr is not None and H <= lr + EPS
            f = M1.hose_f(k, H, phi)
            ep = M1.joint_err(k, f, e, R45.S_STAR)
            how, flips, margin, n_plan = "pose sides", None, None, None
            if ep is None and not in_pose:
                how = "none (outside, not searched)"
            elif ep is None:
                fm = np.asarray(f, float) + np.asarray(e, float)
                s0 = E53.sides(k)
                best, n_plan = None, 0
                for c in itertools.product((-1.0, 1.0), repeat=len(s0)):
                    s = np.array(c)
                    eps_ = E53.joint_err_with(k, f, e, s)
                    if eps_ is None:
                        continue
                    n_plan += 1
                    m = E53.common_margin(k, fm, s)
                    if m is not None and (best is None or m > best[0] + 1e-12):
                        best = (m, s, eps_)
                if best is None:
                    how, ep = "none", None
                else:
                    how, margin, ep = "per-load sides", best[0], best[2]
                    flips = [M1.ROB[n][1][jj] for jj, x, y in zip(M1.light(n), s0, best[1]) if x != y]
            y = None if (ep is None or er is None) else E52.y_mm(k, ref, ep, er)
            rows.append({"pose": list(k[1:]), "axis": ai, "cal_ok": er is not None, "in51": bool(in51),
                         "in_pose": bool(in_pose), "how": how, "flips": flips, "margin": margin,
                         "n_plan": n_plan, "y": y})
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


if __name__ == "__main__":
    procs = int(os.environ.get("M54_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    with ctx.Pool(procs) as pool:
        L = pool.map(task_limits, allkeys, chunksize=1)
    lim_g = {k: g for k, g, _ in L}
    lim_s = {k: s for k, _, s in L}
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "seed": SEED,
           "loads": [{"H": H, "phi": p} for H, p in LOADS]}
    print("# Milestone 54: milestone 53's three hose rules at Latin-hypercube hose loads, and the drag envelope "
          "between grid directions")
    print(f"LHS loads: {N_LHS} (H in [0, {HLHS:g}] N, phi in [0, 360) deg, seed {SEED}; same loads for both robots)")
    print("  " + "; ".join(f"{H:.2f} N @ {p:.1f}" for H, p in LOADS))

    print("\n## A0. Reproduction: the bisection at the 8 grid directions against milestone 50's limits "
          "(largest |difference|, N, over every pose and direction; None must match None)")
    worst, mism = 0.0, 0
    for k in allkeys:
        for i in range(8):
            a, b = lim_g[k][i], grid_tol(k, i)
            if (a is None) != (b is None):
                mism += 1
            elif a is not None:
                worst = max(worst, abs(a - b))
    print(f"  largest |difference| {worst:.2e} N; None mismatches {mism}")
    out["A0"] = {"worst": worst, "mismatch": mism}

    print("\n## A. Drag limit at the sampled directions against the grid read by the smaller neighbour: robot | pose | "
          "samples | limit below the smaller neighbour by more than 0.5 N | largest shortfall (N, at phi) | "
          "smallest limit over the samples (N, at phi) | smallest grid limit (N)")
    A, short_all = [], []
    for k in allkeys:
        sh = []
        for (H, phd), t in zip(LOADS, lim_s[k]):
            gm = grid_min(k, phd)
            if gm is None:
                continue
            tt = 0.0 if t is None else t
            sh.append((gm - tt, phd, tt, gm))
        bad = [x for x in sh if x[0] > 0.5]
        ws = max(sh) if sh else None
        mins = min(((0.0 if t is None else t), phd) for (_, phd), t in zip(LOADS, lim_s[k]))
        gmin = min((0.0 if grid_tol(k, i) is None else grid_tol(k, i)) for i in range(8))
        A.append({"key": list(k), "n": len(sh), "bad": len(bad), "worst": ws, "min": mins, "gmin": gmin})
        short_all += [(k, x) for x in bad]
        print(f"  {k[0]} | {list(k[1:])} | {len(sh)} | {len(bad)} | "
              + ("-" if ws is None else f"{ws[0]:+.2f} ({ws[1]:.1f})") + f" | {mins[0]:.2f} ({mins[1]:.1f}) | {gmin:.2f}")
    out["A"] = A
    out["limits"] = [{"key": list(k), "grid": lim_g[k], "lhs": lim_s[k]} for k in allkeys]
    out["shortfalls"] = [{"robot": k[0], "pose": list(k[1:]), "phi": phd, "shortfall": grid_min(k, phd) - (t or 0.0)}
                         for k in allkeys for (_, phd), t in zip(LOADS, lim_s[k]) if grid_min(k, phd) is not None]

    lim = {str(list(k)): lim_s[k] for k in allkeys}
    jobs = [(n, j, {kk: v[j] for kk, v in lim.items()}) for n in ("g1", "h1") for j in range(N_LHS)]
    with ctx.Pool(procs) as pool:
        res = pool.map(task, jobs, chunksize=1)
    out["runs"] = res

    print("\n## B. Per robot: pose-cases | inside milestone 51's envelope (at the sampled phi): cases / planned on the "
          "pose's sides / planned by per-load sides / no plan / coverage | pose-only envelope: cases / planned / "
          "coverage | outside both: cases / planned | worst |y| inside m51 envelope (mm, at) | worst |y| inside "
          "pose-only (mm)")
    B, drops = {}, []
    for n in ("g1", "h1"):
        s = dict(cases=0, in51=0, p0=0, p1=0, none=0, inp=0, inp_pl=0, out=0, out_pl=0, w51=0.0, at=None, wp=0.0,
                 cal_fail=0)
        for x in res:
            if x["robot"] != n:
                continue
            for r in x["rows"]:
                s["cases"] += 1
                s["cal_fail"] += not r["cal_ok"]
                pl = r["y"] is not None
                if r["in51"]:
                    s["in51"] += 1
                    s["p0"] += pl and r["how"] == "pose sides"
                    s["p1"] += pl and r["how"] == "per-load sides"
                    s["none"] += not pl
                    if pl and r["y"] > s["w51"]:
                        s["w51"], s["at"] = r["y"], (r["pose"], round(x["H"], 2), round(x["phi"], 1))
                if r["in_pose"]:
                    s["inp"] += 1
                    s["inp_pl"] += pl
                    if pl:
                        s["wp"] = max(s["wp"], r["y"])
                if not r["in_pose"]:
                    s["out"] += 1
                    s["out_pl"] += pl
                if not pl and r["in_pose"]:
                    drops.append((n, round(x["H"], 2), round(x["phi"], 1), r["pose"], r["axis"], r["in51"],
                                  r["n_plan"]))
        B[n] = s
        c51 = 100 * (s["p0"] + s["p1"]) / max(s["in51"], 1)
        cp = 100 * s["inp_pl"] / max(s["inp"], 1)
        print(f"  {n} | {s['cases']} | {s['in51']} / {s['p0']} / {s['p1']} / {s['none']} / {c51:.1f}% | "
              f"{s['inp']} / {s['inp_pl']} / {cp:.1f}% | {s['out']} / {s['out_pl']} | {s['w51']:.4f} ({s['at']}) | "
              f"{s['wp']:.4f}   (slack calibration with no plan: {s['cal_fail']})")
    out["B"] = B

    print("\n## B1. Per-load side recoveries inside the pose-only envelope: robot | H | phi | pose | axis | sides "
          "flipped | common leg margin (N m) | |y| (mm)")
    for x in res:
        for r in x["rows"]:
            if r["how"] == "per-load sides" and r["in_pose"] and r["y"] is not None:
                print(f"  {x['robot']} | {x['H']:.2f} | {x['phi']:.1f} | {r['pose']} | {r['axis']} | "
                      f"{', '.join(r['flips']) or 'none'} | {r['margin']:.3f} | {r['y']:.4f}")

    print("\n## B2. No plan inside the pose-only envelope: robot | H | phi | pose | sensor axis | inside m51 envelope "
          "| side combinations whose full plan solves")
    for d in drops:
        print("  " + " | ".join(str(v) for v in d))
    out["drops"] = drops

    print("\n## B3. Worst |y| by drag band inside milestone 51's envelope (robot | [0, 5) | [5, 10) | [10, 15) | "
          "[15, 20] N, mm; planned cases)")
    for n in ("g1", "h1"):
        cells = []
        for lo in (0, 5, 10, 15):
            ys = [r["y"] for x in res if x["robot"] == n and lo <= x["H"] < lo + 5 + (lo == 15)
                  for r in x["rows"] if r["in51"] and r["y"] is not None]
            cells.append(f"{max(ys):.4f} ({len(ys)})" if ys else "-")
        print(f"  {n} | " + " | ".join(cells))

    print("\n## C. Hypotheses (registered in LOG.md before this run)")
    C = {}
    n51 = sum(B[n]["none"] for n in B)
    C["H217"] = n51 == 0
    print(f"H217 (every LHS pose-case inside milestone 51's envelope has a plan): "
          + ", ".join(f"{n} {B[n]['p0'] + B[n]['p1']} of {B[n]['in51']}" for n in B)
          + f" -> {'held' if C['H217'] else 'refuted'}")
    w = max(B[n]["w51"] for n in B)
    C["H218"] = w <= SPEC + 1e-12
    print(f"H218 (every planned in-envelope LHS pose-case at most {SPEC} mm): worst "
          + ", ".join(f"{n} {B[n]['w51']:.4f}" for n in B) + f" -> {'held' if C['H218'] else 'refuted'}")
    C["H219"] = not short_all
    print(f"H219 (no sampled limit more than 0.5 N below the smaller neighbouring grid limit): {len(short_all)} "
          f"(pose, direction) pairs below -> {'held' if C['H219'] else 'refuted'}")
    for k, x in short_all[:40]:
        print(f"  {k}: phi {x[1]:.1f}, limit {x[2]:.2f} N, smaller neighbour {x[3]:.2f} N, shortfall {x[0]:.2f} N")
    out["C"] = C
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)  # compact: ~10k rows
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

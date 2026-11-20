"""Milestone 62: the exact envelope gate, the planner's own limit over every hold-side combination.

Milestone 61 found the balance gate (milestone 50's balance-and-cones LP) up to 44 N looser than the planner's limit
L_p on the pose's own hold sides, and that other hold sides recover most of the gap. Here L_any, the largest drag with
a force plan on any hold-side combination (``gate.lany``), is bisected at every pose and load direction, and the gate
H <= L_any - band (with the reference pose's balance gate unchanged) replaces the balance gate. Inside it, milestone
61's chain runs per case unchanged: milestone 59's four-row rule, milestone 60's uniform leg raise, milestone 61's
wider squeeze (``m61.task``). Section I is held out: 48 Latin-hypercube loads (seed 62), 6 random-direction 0.2 N
errors (seed 62). Check: as milestone 61's. Hypotheses H241-H243 (LOG.md, registered before the run).
M62_PROCS sets the pool (default 4); M62_N the loads.
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import json
import math
import os
import platform
import sys
import time

N = int(os.environ.get("M62_N", "48"))
os.environ["M61_N"] = str(N)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np  # noqa: E402
import gate as G  # noqa: E402

spec = importlib.util.spec_from_file_location("m61", os.path.join(HERE, "..", "m61_lastfour", "run.py"))
E61 = importlib.util.module_from_spec(spec)
sys.modules["m61"] = E61
spec.loader.exec_module(E61)                     # milestone 61's chain (and so 60's, 59's, ... 38's)

T0 = time.time()
C, E59, E55, E54, E51, M1 = E61.C, E61.E59, E61.E55, E61.E54, E61.E51, E61.M1
SPEC, AX, EPS, B = E61.SPEC, E61.AX, E61.EPS, E61.B
SEED = 62
E61.SEED = SEED
E61.LOADS = LOADS = E54.lhs(N, SEED)
E61.ERRS = ERRS = [B * a for a in E55.rand_dirs(6, SEED)]
BAND = E61.BAND                                  # 0.5 N, milestone 61's band
BANDS = [0.0, 0.1, 0.2, 0.3, 0.5, 1.0]


def task_lany(args):
    key, phis, lps, lims = args
    C.setup(key[0])
    return key, [G.lany(key, math.radians(p), a, b) for p, a, b in zip(phis, lps, lims)]


def gap_stats(lims, gl, n):
    d, none, tot, above = [], 0, 0, 0
    for kk in lims:
        if f"'{n}'" not in kk:
            continue
        for a, x in zip(lims[kk], gl[kk]):
            if a is None:
                continue
            tot += 1
            above += bool(x["above"])
            if x["L"] is None:
                none += 1
                continue
            d.append(a - x["L"])
    return {"pairs": tot, "none": none, "above": above, "med": float(np.median(d)), "max": float(max(d)),
            "n01": int(sum(x > 0.01 for x in d)), "n05": int(sum(x > 0.5 for x in d))}


if __name__ == "__main__":
    procs = int(os.environ.get("M62_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    phis = [p for _, p in LOADS]
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B": B, "seed": SEED, "loads": LOADS,
           "errs": [list(map(float, e)) for e in ERRS], "band": BAND, "bands": BANDS, "tol": G.TOL}
    with ctx.Pool(procs) as pool:
        L = pool.map(E61.task_limits, [(k, phis) for k in allkeys], chunksize=1)
        lims = {str(list(k)): v for k, v, _ in L}
        lps = {str(list(k)): w for k, _, w in L}
        LA = pool.map(task_lany, [(k, phis, lps[str(list(k))], lims[str(list(k))]) for k in allkeys], chunksize=1)
        gl = {str(list(k)): v for k, v in LA}
        jobs = [(n, j, {kk: v[j] for kk, v in lims.items()}, {kk: v[j] for kk, v in lps.items()})
                for n in ("g1", "h1") for j in range(N)]
        res = pool.map(E61.task, jobs, chunksize=1)
    out["limits"], out["lp"], out["lany"], out["runs"] = lims, lps, gl, res
    print(f"# Milestone 62: the exact envelope gate, held-out section I ({N} loads, seed {SEED}; milestone 61's chain, "
          f"spec {SPEC} mm; band {BAND} N; L_any tolerance {G.TOL} N; B = {B:.2f} N)")
    print("errors (6 random directions, seed 62): "
          + "; ".join("(" + ", ".join(f"{c:+.3f}" for c in e) + ")" for e in ERRS))
    ch = [c for x in res for c in x["checks"]]
    print(f"check (four-row, no escalation, against milestone 58's rule_all 'iso', first {E61.NCHECK} loads per robot): "
          f"{len(ch)} cases, plan/no-plan mismatches {sum(c['mismatch'] for c in ch)}, 'how' mismatches "
          f"{sum(c['how58'] != c['how'] for c in ch)}, largest |y| or |z| difference "
          f"{max((c['d'] for c in ch), default=0.0):.1e} mm")
    print("\n## A. The balance limit against the planner's limits (every pose and load direction): robot | pairs | "
          "L_any none | any side plans at balance + 0.5 N | balance - L_p: median, max, pairs > 0.01 N | "
          "balance - L_any: median, max, pairs > 0.01 N, pairs > 0.5 N")
    A = {}
    for n in ("g1", "h1"):
        gp = []
        for kk in lims:
            if f"'{n}'" in kk:
                gp += [a - b for a, b in zip(lims[kk], lps[kk]) if a is not None and b is not None]
        s = gap_stats(lims, gl, n)
        s |= {"p_med": float(np.median(gp)), "p_max": float(max(gp)), "p_n01": int(sum(x > 0.01 for x in gp))}
        A[n] = s
        print(f"  {n} | {s['pairs']} | {s['none']} | {s['above']} | {s['p_med']:.3f}, {s['p_max']:.3f}, {s['p_n01']} | "
              f"{s['med']:.3f}, {s['max']:.3f}, {s['n01']}, {s['n05']}")
    print("\n  pairs where L_any < balance - 0.5 N: robot | pose | phi deg | balance | L_p | L_any (N)")
    for kk in sorted(gl):
        for j, (a, b, x) in enumerate(zip(lims[kk], lps[kk], gl[kk])):
            if a is not None and x is not None and (x["L"] is None or a - x["L"] > 0.5):
                lv = "none" if x["L"] is None else f"{x['L']:.2f}"
                print(f"  {kk} | {phis[j]:.1f} | {a:.2f} | {'-' if b is None else f'{b:.2f}'} | {lv}")

    def ingate(n, j, r, band):
        x = gl[str([n] + r["pose"])][j]
        return bool(r["in51"] and x is not None and x["L"] is not None and LOADS[j][0] <= x["L"] - band + EPS)

    def inpose(n, j, r, band):
        pk = lps[str([n] + r["pose"])][j]
        return bool(r["in51"] and pk is not None and LOADS[j][0] <= pk - band + EPS)

    print(f"\n## B. Coverage under each gate (band {BAND} N): robot | balance-envelope cases | planned | "
          "pose-side gate: cases, planned, dropped | exact gate: cases, planned, dropped")
    S = {}
    for n in ("g1", "h1"):
        rows = [(x["j"], r) for x in res if x["robot"] == n for r in x["rows"] if r["in51"]]
        pl = [(j, r) for j, r in rows if "out" in r and E61.planned(r)]
        ps = [(j, r) for j, r in rows if inpose(n, j, r, BAND)]
        ex = [(j, r) for j, r in rows if ingate(n, j, r, BAND)]
        s = {"in51": len(rows), "planned": len(pl),
             "pose": len(ps), "pose_pl": sum("out" in r and E61.planned(r) for _, r in ps), "pose_drop": len(rows) - len(ps),
             "ex": len(ex), "ex_pl": sum("out" in r and E61.planned(r) for _, r in ex), "ex_drop": len(rows) - len(ex)}
        S[n] = s
        print(f"  {n} | {s['in51']} | {s['planned']} | {s['pose']}, {s['pose_pl']}, {s['pose_drop']} "
              f"({100.0 * s['pose_drop'] / max(s['in51'], 1):.2f}%) | {s['ex']}, {s['ex_pl']}, {s['ex_drop']} "
              f"({100.0 * s['ex_drop'] / max(s['in51'], 1):.2f}%)")
    print("\n## C. The band: robot | band N | exact-gate cases | unplanned among them | balance-envelope cases dropped")
    BS = {}
    for n in ("g1", "h1"):
        rows = [(x["j"], r) for x in res if x["robot"] == n for r in x["rows"] if r["in51"]]
        for band in BANDS:
            ex = [(j, r) for j, r in rows if ingate(n, j, r, band)]
            un = sum(not ("out" in r and E61.planned(r)) for _, r in ex)
            BS[f"{n} {band}"] = {"ex": len(ex), "un": un, "drop": len(rows) - len(ex)}
            print(f"  {n} | {band:g} | {len(ex)} | {un} | {len(rows) - len(ex)}")
    print("\n## D. Each balance-envelope case the chain leaves unplanned, or that needed an escalation: robot | pose | "
          "H N | phi deg | error | binding joint | leg M | squeeze S | L_p, L_any, balance (N) | exact gate")
    for x in res:
        for r in x["rows"]:
            if "esc" not in r:
                continue
            e = r["esc"]
            la = gl[str([x["robot"]] + r["pose"])][x["j"]]
            lav = "none" if la is None or la["L"] is None else f"{la['L']:.3f}"
            lpv = "-" if r["lp"] is None else f"{r['lp']:.3f}"
            print(f"  {x['robot']} | {r['pose']} | {x['H']:.2f} | {x['phi']:.1f} | {r['axis']} | {e['bind']} | "
                  f"{e['Mu']} | {e.get('S')} | {lpv}, {lav}, "
                  f"{r['lim']:.3f} | {ingate(x['robot'], x['j'], r, BAND)}")
    print("\n## E. Hypotheses (registered in LOG.md before this run)")
    D = {}
    worst = max(A[n]["max"] for n in A)
    frac = {n: (A[n]["n05"] + A[n]["none"]) / max(A[n]["pairs"], 1) for n in A}
    D["H241"] = all(frac[n] <= 0.05 for n in A) and all(A[n]["above"] == 0 for n in A)
    print(f"H241 (L_any is within 0.5 N of the balance limit in at least 95% of pairs on each robot, and no side "
          f"plans past the balance limit): G1 {A['g1']['n05']} of {A['g1']['pairs']}, H1 {A['h1']['n05']} of "
          f"{A['h1']['pairs']} pairs short by > 0.5 N (largest {worst:.2f} N); above balance {A['g1']['above']}, "
          f"{A['h1']['above']} -> {'held' if D['H241'] else 'refuted'}")
    miss = sum(S[n]["ex"] - S[n]["ex_pl"] for n in S)
    D["H242"] = miss == 0
    print(f"H242 (the chain plans every case inside the exact gate, H <= L_any - {BAND} N): cases "
          f"{sum(S[n]['ex'] for n in S)}, unplanned {miss} -> {'held' if D['H242'] else 'refuted'}")
    D["H243"] = all(S[n]["ex_drop"] < S[n]["pose_drop"] and S[n]["ex_drop"] <= 0.003 * S[n]["in51"] for n in S)
    print(f"H243 (the exact gate drops fewer balance-envelope cases than the pose-side gate, and at most 0.3%, on each "
          f"robot): G1 {S['g1']['ex_drop']} vs {S['g1']['pose_drop']}, H1 {S['h1']['ex_drop']} vs "
          f"{S['h1']['pose_drop']} -> {'held' if D['H243'] else 'refuted'}")
    out["A"], out["S"], out["BS"], out["D"] = A, S, BS, D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

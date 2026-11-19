"""Milestone 52: milestone 48's sweep with the calibration taken with the hose slack.

Milestone 51 (its run, imported unchanged) found 75 of the G1's 96 dropped pose-cases inside milestone 50's drag
envelope come from the calibration pose (milestone 30's, 1.0 m, 0) having no plan under the swept drag, which drops
every pose of that case. The calibration is one move, so the hose can be slack for it. Here the calibration takes
the slack-hose force (``hose_f(ref, 0, 0)``: the hanging weight only) with the same sensor error, and each pose keeps
its loaded press; milestone 51's loaded calibration is computed alongside for the comparison.
A. Every case: coverage and worst residual along the wall under the slack calibration, inside milestone 51's
   envelope and inside a pose-only envelope (the calibration no longer carries drag).
B. Per pose-case planned under both calibrations: the change in |y|.
C. Every remaining in-envelope drop re-run with an exact sensor.
D. Hypotheses H211-H213 (LOG.md, registered before the run). M52_PROCS sets the pool (default 4).
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

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
T0 = time.time()
spec = importlib.util.spec_from_file_location("m51", os.path.join(HERE, "..", "m51_envelope", "run.py"))
E51 = importlib.util.module_from_spec(spec)
sys.modules["m51"] = E51
spec.loader.exec_module(E51)                     # milestone 51's envelope (and milestone 48's sweep, sides installed)
R, M1, R45, R43 = E51.R, E51.M1, E51.R45, E51.R43
SPEC = E51.SPEC
EPS = E51.EPS


def inside_pose(key, H, i):
    """Pose-only envelope: drag at most the pose's tolerated drag at this direction (calibration is slack)."""
    if H == 0:
        return True
    t = E51.tol(key, i)
    return t is not None and H <= t + EPS


def y_mm(key, ref, ep, er):
    return abs(M1.C.compensated(M1.POSE[key].rows[:2], M1.POSE[ref].rows[:2], ep, er, M1.L0)["y"][0]) / M1.MM


def task(args):
    n, H = args
    R.R47.set_tier(True)
    M1.GAPR = R43.gaps(M1, n, "braked")
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    ref = E51.ref_key(n)
    f_slack = M1.hose_f(ref, 0.0, 0.0)
    rows = []
    for i in M1.phis_for(H):
        phi = M1.PHIS[i] if H > 0 else 0.0
        for ai, a in enumerate(M1.AXES):
            e = R45.B_E * a
            er_s = M1.joint_err(ref, f_slack, e, R45.S_STAR)
            er_l = M1.joint_err(ref, M1.hose_f(ref, H, phi), e, R45.S_STAR)
            per = {}
            for k in keys:
                ep = M1.joint_err(k, M1.hose_f(k, H, phi), e, R45.S_STAR)
                ys = None if (ep is None or er_s is None) else y_mm(k, ref, ep, er_s)
                yl = None if (ep is None or er_l is None) else y_mm(k, ref, ep, er_l)
                ex = None
                if ys is None and ep is None:
                    z = np.zeros(3)
                    ex = M1.joint_err(k, M1.hose_f(k, H, phi), z, R45.S_STAR) is not None
                per[str(list(k[1:]))] = {"slack": ys, "loaded": yl, "pose_ok": ep is not None, "exact_ok": ex}
            rows.append({"H": H, "i": i, "phi": round(math.degrees(phi)), "axis": ai,
                         "cal_slack_ok": er_s is not None, "cal_loaded_ok": er_l is not None, "y": per})
    return {"robot": n, "H": H, "rows": rows}


if __name__ == "__main__":
    procs = int(os.environ.get("M52_PROCS", "4"))
    jobs = [(n, H) for n in ("g1", "h1") for H in R45.HB]
    with M1.mp.get_context("fork").Pool(procs) as pool:
        res = pool.map(task, jobs, chunksize=1)
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "runs": res}
    print("# Milestone 52: milestone 48's sweep with the calibration taken with the hose slack "
          "(calibration force = hanging hose weight only, same sensor error; each pose keeps its loaded press)")
    print(f"calibration pose: {[E51.ref_key(n) for n in ('g1', 'h1')]}")
    print("## A. robot | H | pose-cases | planned (slack cal) | planned (loaded cal, milestone 51) | "
          "inside m51 envelope: cases / planned slack / planned loaded | inside pose-only envelope: cases / planned "
          "slack | worst |y| inside m51 envelope, slack cal (mm, at) | worst |y| all planned, slack cal (mm)")
    summ, drops, deltas = {}, [], []
    cal_fail = {}
    for x in res:
        n, H = x["robot"], x["H"]
        s = dict(cases=0, ps=0, pl=0, in51=0, in51_ps=0, in51_pl=0, inp=0, inp_ps=0, worst_in51=0.0, at=None,
                 worst_all=0.0, worst_in51_loaded=0.0)
        for r in x["rows"]:
            if not r["cal_slack_ok"]:
                cal_fail.setdefault(n, []).append((H, r["phi"], r["axis"]))
            for p, v in r["y"].items():
                key = (n,) + tuple(json.loads(p))
                i51 = E51.inside(key, n, H, r["i"])
                ip = inside_pose(key, H, r["i"])
                s["cases"] += 1
                s["ps"] += v["slack"] is not None
                s["pl"] += v["loaded"] is not None
                s["in51"] += i51
                s["inp"] += ip
                if i51:
                    s["in51_ps"] += v["slack"] is not None
                    s["in51_pl"] += v["loaded"] is not None
                    if v["loaded"] is not None:
                        s["worst_in51_loaded"] = max(s["worst_in51_loaded"], v["loaded"])
                if ip:
                    s["inp_ps"] += v["slack"] is not None
                if v["slack"] is None:
                    if i51 or ip:
                        drops.append((n, H, p, r["phi"], r["axis"], r["cal_slack_ok"], v["pose_ok"],
                                      v["exact_ok"], bool(i51), bool(ip)))
                    continue
                s["worst_all"] = max(s["worst_all"], v["slack"])
                if i51 and v["slack"] > s["worst_in51"]:
                    s["worst_in51"], s["at"] = v["slack"], (p, r["phi"])
                if v["loaded"] is not None:
                    deltas.append((n, H, v["slack"] - v["loaded"], v["slack"], v["loaded"], p, r["phi"]))
        summ[(n, H)] = s
        print(f"  {n} | {H:4.1f} | {s['cases']} | {s['ps']} | {s['pl']} | {s['in51']} / {s['in51_ps']} / "
              f"{s['in51_pl']} | {s['inp']} / {s['inp_ps']} | {s['worst_in51']:.4f} ({s['at']}) | "
              f"{s['worst_all']:.4f}")
    tot = {}
    for n in ("g1", "h1"):
        ss = [v for k, v in summ.items() if k[0] == n]
        t = {k: sum(v[k] for v in ss) for k in ("cases", "ps", "pl", "in51", "in51_ps", "in51_pl", "inp", "inp_ps")}
        tot[n] = t
        print(f"  {n}: planned {t['ps']} of {t['cases']} with the slack calibration ({100 * t['ps'] / t['cases']:.1f}%), "
              f"{t['pl']} with the loaded one ({100 * t['pl'] / t['cases']:.1f}%); inside milestone 51's envelope "
              f"{t['in51_ps']} of {t['in51']} ({100 * t['in51_ps'] / t['in51']:.1f}%; loaded "
              f"{100 * t['in51_pl'] / t['in51']:.1f}%); inside the pose-only envelope {t['inp_ps']} of {t['inp']} "
              f"({100 * t['inp_ps'] / t['inp']:.1f}%)")
    print("\n## A1. Slack calibration with no plan (robot: (H, phi, sensor axis)):")
    for n in ("g1", "h1"):
        print(f"  {n}: {cal_fail.get(n, [])}")

    print("\n## B. |y| slack calibration minus |y| loaded calibration, pose-cases planned under both "
          "(robot | H | count | min | median | max of the change, mm | worst |y| loaded, slack)")
    for n in ("g1", "h1"):
        for H in R45.HB:
            d = [x[2] for x in deltas if x[0] == n and x[1] == H]
            if not d:
                continue
            ws = max(x[3] for x in deltas if x[0] == n and x[1] == H)
            wl = max(x[4] for x in deltas if x[0] == n and x[1] == H)
            print(f"  {n} | {H:4.1f} | {len(d)} | {min(d):+.4f} | {float(np.median(d)):+.4f} | {max(d):+.4f} | "
                  f"{wl:.4f}, {ws:.4f}")

    print("\n## C. Pose-cases with no plan under the slack calibration, inside either envelope: robot | H | pose | "
          "phi | sensor axis | calibration plans | pose plans | pose plans with an exact sensor | in m51 envelope | "
          "in pose-only envelope")
    for d in drops[:120]:
        print("  " + " | ".join(str(v) for v in d))
    if len(drops) > 120:
        print(f"  ... {len(drops) - 120} more")
    cnt = {}
    for d in drops:
        c = ("calibration" if not d[5] else ("own pose, sensor error" if d[7] else "own pose, plan limit"))
        k = (d[0], "m51" if d[8] else "pose-only only", c)
        cnt[k] = cnt.get(k, 0) + 1
    print("  counts (robot | envelope | class | n):")
    for k in sorted(cnt):
        print(f"  {k[0]} | {k[1]} | {k[2]} | {cnt[k]}")

    print("\n## D. Hypotheses (registered in LOG.md before this run)")
    D = {}
    g = tot["g1"]
    cov = 100 * g["in51_ps"] / g["in51"]
    D["H211"] = cov > 98.0
    print(f"H211 (G1 plans more than 98% of its pose-cases inside milestone 51's envelope): {g['in51_ps']} of "
          f"{g['in51']} = {cov:.1f}% (milestone 51: 93.0%) -> {'held' if D['H211'] else 'refuted'}")
    w = {k: v["worst_in51"] for k, v in summ.items()}
    D["H212"] = all(v <= SPEC + 1e-12 for v in w.values())
    print("H212 (worst residual inside milestone 51's envelope at most 0.03 mm, slack calibration): "
          + ", ".join(f"{n} {H:g} N {v:.4f}" for (n, H), v in sorted(w.items()))
          + f" -> {'held' if D['H212'] else 'refuted'}")
    D["H213"] = not any(cal_fail.values())
    print(f"H213 (the slack calibration plans at every sensor-error axis on both robots): "
          f"{sum(len(v) for v in cal_fail.values())} cases with no calibration plan -> "
          f"{'held' if D['H213'] else 'refuted'}")
    out["summary"] = {f"{n} {H:g}": v for (n, H), v in summ.items()}
    out["totals"] = tot
    out["drops"] = drops
    out["D"] = D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")

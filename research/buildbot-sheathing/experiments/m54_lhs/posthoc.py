"""Milestone 54 post hoc (not registered): the in-envelope LHS pose-cases over the 0.03 mm spec.

Section B of run.py found 4 planned pose-cases inside milestone 51's envelope with a residual along the wall over
0.03 mm, all planned on the pose's own hold sides. For each (and for the next-worst cases up to 0.02 mm):
P1. |y| over a fine direction sweep (+-6 deg, 0.25 deg steps) at the same drag, sensor axis and pose: is the
    excess a narrow window between directions or a broad region?
P2. The joint whose error moves |y| most: per joint, the change in its error from the median over the sweep,
    weighted by that joint's row of the wall-direction Jacobian; with its planned and settled torques at both window
    ends (a sign change between plan and settle is a backlash crossing).
P3. Milestone 53's per-load side search applied to the case anyway (the largest common leg margin among the side
    combinations whose full plan solves): does it bring |y| inside spec?
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import itertools
import json
import math
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
T0 = time.time()
spec = importlib.util.spec_from_file_location("m54", os.path.join(HERE, "run.py"))
E54 = importlib.util.module_from_spec(spec)
sys.modules["m54"] = E54
spec.loader.exec_module(E54)
E53, E52, E51, R, M1, R45, R43 = E54.E53, E54.E52, E54.E51, E54.R, E54.M1, E54.R45, E54.R43
SPEC = E54.SPEC
D = json.load(open(os.path.join(HERE, "results.json")))


def setup(n):
    R.R47.set_tier(True)
    M1.GAPR = R43.gaps(M1, n, "braked")


def y_at(key, H, phd, e, er, signs=None):
    f = M1.hose_f(key, H, math.radians(phd))
    ep = M1.joint_err(key, f, e, R45.S_STAR) if signs is None else E53.joint_err_with(key, f, e, signs)
    if ep is None or er is None:
        return None, None
    return E52.y_mm(key, (key[0],) + (1.0, 0.0), ep, er), ep


def task(c):
    n, H, phd, pose, ax = c
    setup(n)
    key = (n,) + tuple(pose)
    ref = E51.ref_key(n)
    e = R45.B_E * M1.AXES[ax]
    er = M1.joint_err(ref, M1.hose_f(ref, 0.0, 0.0), e, R45.S_STAR)
    y0, ep0 = y_at(key, H, phd, e, er)
    sweep = []
    eps = []
    for d in np.arange(-6.0, 6.0001, 0.25):
        y, ep = y_at(key, H, phd + d, e, er)
        sweep.append((float(d), y))
        if ep is not None:
            eps.append(np.asarray(ep, float))
    # P2: which joint's error moves |y|: finite-difference |y| sensitivity by replacing one joint's error with its
    # sweep median
    med = np.median(np.array(eps), axis=0)
    names = M1.ROB[n][1]
    contrib = []
    for j in range(len(ep0)):
        ej = np.array(ep0, float)
        ej[j] = med[j]
        yj = E52.y_mm(key, ref, ej, er)
        contrib.append((y0 - yj, names[j], float(ep0[j]), float(med[j])))
    contrib.sort(reverse=True)
    f = M1.hose_f(key, H, math.radians(phd))
    p = M1.plan(key, f, e, R45.S_STAR)
    jtop = names.index(contrib[0][1])
    tq = {"plan": [float(t[jtop]) for t in p[1]], "settled": [float(t[jtop]) for t in p[0]], "squeeze": float(p[2])}
    # P3: per-load side rule applied anyway
    fm = np.asarray(f, float) + np.asarray(e, float)
    s0 = E53.sides(key)
    best = None
    for cb in itertools.product((-1.0, 1.0), repeat=len(s0)):
        s = np.array(cb)
        ep = E53.joint_err_with(key, f, e, s)
        if ep is None:
            continue
        m = E53.common_margin(key, fm, s)
        if m is not None and (best is None or m > best[0] + 1e-12):
            best = (m, s, ep)
    yb = None if best is None else E52.y_mm(key, ref, best[2], er)
    return {"case": c, "y0": y0, "sweep": sweep, "contrib": contrib[:3], "tq": tq,
            "best": None if best is None else {"margin": best[0], "sides": E53.fmt(best[1]),
                                              "pose_sides": E53.fmt(s0), "y": yb}}


if __name__ == "__main__":
    cases = []
    for x in D["runs"]:
        for r in x["rows"]:
            if r["in51"] and r["y"] is not None and r["y"] > 0.02:
                cases.append((x["robot"], x["H"], x["phi"], r["pose"], r["axis"]))
    cases.sort(key=lambda c: -[r["y"] for x in D["runs"] if x["robot"] == c[0] and x["H"] == c[1]
                               for r in x["rows"] if r["pose"] == c[3] and r["axis"] == c[4]][0])
    with M1.mp.get_context("fork").Pool(int(os.environ.get("M54_PROCS", "4"))) as pool:
        res = pool.map(task, cases, chunksize=1)
    print("# Milestone 54 post hoc (not registered): in-envelope LHS pose-cases with |y| over 0.02 mm")
    for x in res:
        n, H, phd, pose, ax = x["case"]
        ys = [y for _, y in x["sweep"] if y is not None]
        over = [d for d, y in x["sweep"] if y is not None and y > SPEC]
        print(f"\n## {n} {pose} | H {H:.2f} N | phi {phd:.1f} | sensor axis {ax} | |y| {x['y0']:.4f} mm")
        print(f"  P1 sweep +-6 deg (0.25 deg): {len(ys)} of {len(x['sweep'])} plan; |y| median {np.median(ys):.4f}, "
              f"max {max(ys):.4f} mm; over {SPEC} mm at offsets "
              + (f"{min(over):+.2f} to {max(over):+.2f} deg ({len(over)} points)" if over else "none"))
        print("  P1 |y| by offset: " + " ".join(f"{d:+.1f}:{'-' if y is None else f'{y:.3f}'}"
                                                 for d, y in x["sweep"][::4]))
        print("  P2 joints moving |y| most (|y| drop when that joint's error takes its sweep median; error now / "
              "median, rad): " + "; ".join(f"{nm} {dy:+.4f} mm ({a:.2e} / {b:.2e})" for dy, nm, a, b in x["contrib"]))
        t = x["tq"]
        print(f"  P2 that joint's torque at 25 / 50 N: planned {t['plan'][0]:+.4f} / {t['plan'][1]:+.4f} N m, "
              f"settled {t['settled'][0]:+.4f} / {t['settled'][1]:+.4f} N m; squeeze {t['squeeze']:+.3f} N")
        b = x["best"]
        print("  P3 per-load side rule applied anyway: "
              + ("no combination plans" if b is None else
                 f"pose sides {b['pose_sides']} -> {b['sides']}, common leg margin {b['margin']:.3f} N m, "
                 f"|y| {b['y']:.4f} mm ({'in' if b['y'] <= SPEC else 'over'} spec)"))
    json.dump(res, open(os.path.join(HERE, "posthoc.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s)")

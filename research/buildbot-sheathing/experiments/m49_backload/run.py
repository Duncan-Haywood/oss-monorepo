"""Milestone 49, section A: is the backward-hose infeasibility a stance limit or a margin-LP false negative?

At every (pose, hose load, window end) where milestone 48 found no side combination with a margin LP solution,
for every combination the hold QP solves: the hold force's base residual and cone violation, the common leg margin
evaluated at that force (an explicit feasible point of the margin LP), the margin LP's HiGHS status and message,
and the balance-and-cones feasibility LP. Writes results.json; prints a table.
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
from scipy.optimize import linprog

HERE = os.path.dirname(os.path.abspath(__file__))
T0 = time.time()
spec = importlib.util.spec_from_file_location("m48", os.path.join(HERE, "..", "m48_loadside", "run.py"))
R = importlib.util.module_from_spec(spec)
sys.modules["m48"] = R
spec.loader.exec_module(R)
M1, GQ0 = R.M1, R.GQ0
RES = json.load(open(os.path.join(HERE, "..", "m48_loadside", "results.json")))
NOPLAN = [(a["robot"],) + tuple(a["pose"]) for a in RES["A"] if a["ml_h"] is None]


def margin_lp_raw(c, rows, kap, d, cap=1e3):
    """preload.margin_lp, returning HiGHS's status and message as well."""
    n = 3 * c.k
    cost = np.zeros(n + 1)
    cost[-1] = -1.0
    A1 = np.hstack([c.Ain, np.zeros((c.Ain.shape[0], 1))])
    A2 = np.hstack([-(kap[:, None] * c.T[rows]), np.ones((len(rows), 1))])
    b2 = kap * c.tau0[rows] + d
    A, b = np.vstack([A1, A2]), np.concatenate([np.zeros(A1.shape[0]), b2])
    Aeq = np.hstack([c.Aeq, np.zeros((6, 1))])
    r = linprog(cost, A_ub=A, b_ub=b, A_eq=Aeq, b_eq=c.beq, bounds=[(None, None)] * n + [(-cap, cap)],
                method="highs")
    return r


def cell(args):
    key, H, phi, F = args
    r, names, legs = M1.ROB[key[0]]
    q = M1.POSE[key].qpos
    hold = list(M1.light(key[0]))
    n = len(M1.SIGNS[key[0]])
    fh = M1.hose_f(key, H, phi)
    cm = M1.contact(r, q, F, M1.TOOL_KG, np.asarray(fh, float))
    feas, _ = GQ0.margin_lp(cm, [], [])
    # the largest hold margin per combination (the hold QP needs at least tau_f)
    m0s = [GQ0.margin_lp(cm, hold, np.array(cb))[0] for cb in itertools.product((-1.0, 1.0), repeat=n)]
    out = {"robot": key[0], "pose": list(key[1:]), "H": H, "phi": round(math.degrees(phi)), "F": F,
           "feasible": feas is not None, "hold_m0_best": max((m for m in m0s if m is not None), default=None),
           "n_m0": sum(m is not None for m in m0s), "slack": cone_slack(cm), "combos": []}
    for combo in itertools.product((-1.0, 1.0), repeat=n):
        fn, info = GQ0.solve(cm, "hold", legs, np.array(combo), M1.TAUF, hold_idx=hold)
        if fn is None:
            continue
        eq, cone = cm.residuals(fn)
        rows, kap, d = M1.PL.margin_rows(cm.tau(fn), legs, M1.TAUF)
        at_f = float(np.min(kap * cm.tau(fn)[rows] + d))
        lp = margin_lp_raw(cm, rows, kap, d)
        big = margin_lp_raw(cm, rows, kap, d, cap=1e6)
        taul = np.abs(cm.tau(fn)[legs])
        out["combos"].append({"signs": list(combo), "eq": eq, "cone": cone, "qp_ok": info.get("qp_ok"),
                              "at_f": at_f, "lp_status": int(lp.status), "lp_msg": lp.message,
                              "lp_t": None if lp.status != 0 else float(lp.x[-1]),
                              "big_status": int(big.status),
                              "big_t": None if big.status != 0 else float(big.x[-1]),
                              "max_leg_tau": float(taul.max()), "rows": len(rows)})
    return out


def cone_slack(c):
    """Largest s with every friction and unilateral row at most -s (N), the base balanced; None if no balance."""
    n = 3 * c.k
    cost = np.zeros(n + 1)
    cost[-1] = -1.0
    A = np.hstack([c.Ain, np.ones((c.Ain.shape[0], 1))])
    Aeq = np.hstack([c.Aeq, np.zeros((6, 1))])
    r = linprog(cost, A_ub=A, b_ub=np.zeros(A.shape[0]), A_eq=Aeq, b_eq=c.beq,
                bounds=[(None, None)] * n + [(-1e4, 1e4)], method="highs")
    return None if r.status != 0 else float(r.x[-1])


def failing():
    """The cells of milestone 48's post hoc table 1 (parsed from its posthoc.txt), both window ends."""
    import re
    txt = open(os.path.join(HERE, "..", "m48_loadside", "posthoc.txt")).read().split("## 2.")[0]
    jobs = []
    for line in txt.splitlines():
        mk = re.match(r"\s+(g1|h1) \[([-0-9.]+), ([-0-9.]+)\] \(", line)
        if not mk:
            continue
        key = (mk.group(1), float(mk.group(2)), float(mk.group(3)))
        for H, p in re.findall(r"\[([0-9.]+), ([0-9]+):", line):
            for F in (M1.F_HI / 2, M1.F_HI):
                jobs.append((key, float(H), math.radians(float(p)), F))
    return jobs


if __name__ == "__main__":
    only = os.environ.get("M49_ONLY")
    jobs = failing()
    with M1.mp.get_context("fork").Pool(int(os.environ.get("M49_PROCS", "4"))) as pool:
        res = pool.map(cell, jobs, chunksize=1)
    bad = res
    print("# Milestone 49, section A: the 24 cells of milestone 48's post hoc table 1, both window ends")
    print("robot | pose | H | phi | F | balance+cones LP | best cone slack (N) | combos with a hold-margin LP | "
          "best hold margin (N m; the hold QP needs tau_f 0.2) | hold combos | max base residual | max cone viol | "
          "margin at the hold force (min, max) | LP statuses | LP with t bound 1e6 solves | largest |leg tau| (N m)")
    for c in bad:
        xs = c["combos"]
        if not xs:
            print(f"  {c['robot']} {c['pose']} | {c['H']:g} | {c['phi']} | {c['F']:g} | {c['feasible']} | "
                  + ("none" if c["slack"] is None else f"{c['slack']:.2f}") + f" | {c['n_m0']} | "
                  + ("none" if c["hold_m0_best"] is None else f"{c['hold_m0_best']:.3f}") + " | 0 | - ")
            continue
        st = sorted({(x["lp_status"], x["lp_msg"][:60]) for x in xs})
        print(f"  {c['robot']} {c['pose']} | {c['H']:g} | {c['phi']} | {c['F']:g} | {c['feasible']} | "
              + ("none" if c["slack"] is None else f"{c['slack']:.2f}") + f" | {c['n_m0']} | "
              + ("none" if c["hold_m0_best"] is None else f"{c['hold_m0_best']:.3f}") + f" | {len(xs)} | "
              f"{max(x['eq'] for x in xs):.1e} | {max(x['cone'] for x in xs):.1e} | "
              f"{min(x['at_f'] for x in xs):.1f}, {max(x['at_f'] for x in xs):.1f} | {st} | "
              f"{sum(x['big_status'] == 0 for x in xs)} of {len(xs)} | {max(x['max_leg_tau'] for x in xs):.1f}")
    print(f"cells: {len(bad)}")
    summ = []
    for c in bad:
        xs = c.pop("combos")
        c.update({"n_hold": len(xs), "n_lp_ok": sum(x["lp_status"] == 0 for x in xs),
                  "max_eq": max((x["eq"] for x in xs), default=None),
                  "max_cone": max((x["cone"] for x in xs), default=None),
                  "max_leg_tau": max((x["max_leg_tau"] for x in xs), default=None)})
        summ.append(c)
    lo = [c for c in summ if c["F"] < M1.F_HI]
    hi = [c for c in summ if c["F"] == M1.F_HI]
    print(f"25 N end: {sum(c['feasible'] for c in lo)} of {len(lo)} cells balance; hold solutions "
          f"{sum(c['n_hold'] for c in lo)}, margin LP solves {sum(c['n_lp_ok'] for c in lo)} of them")
    print(f"50 N end: {sum(c['feasible'] for c in hi)} of {len(hi)} cells balance; best cone slack "
          f"{min(c['slack'] for c in hi):.2f} to {max(c['slack'] for c in hi):.2f} N; hold solutions "
          f"{sum(c['n_hold'] for c in hi)}")
    json.dump(summ, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s)")

"""Milestone 48 post hoc (after the run; not registered): why 8 poses have no side with a plan at every hose load.

1. Per such pose, each hose load (H, phi) and window end: how many of the side combinations have a 'hold' solution
   and a margin LP solution, so the load(s) no side can hold are named.
2. Section D's sweep drops a (pose, load, sensor error) case whose plan has no solution. Per robot and pose, count the
   swept cases with no plan on milestone 48's sides, so the worst residuals are read with their coverage.
"""
import importlib.util
import itertools
import json
import math
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m48", os.path.join(HERE, "run.py"))
R = importlib.util.module_from_spec(spec)
sys.modules["m48"] = R
spec.loader.exec_module(R)
M1, R45, R43, GQ0 = R.M1, R.R45, R.R43, R.GQ0
T0 = time.time()
RES = json.load(open(os.path.join(HERE, "results.json")))
NOPLAN = [(a["robot"],) + tuple(a["pose"]) for a in RES["A"] if a["ml_h"] is None]
for a in RES["A"]:
    if a["on_sh"]:
        R.SIDE[(a["robot"],) + tuple(a["pose"])] = np.array(a["sh"])


def load_table(key):
    r, names, legs = M1.ROB[key[0]]
    q = M1.POSE[key].qpos
    hold = list(M1.light(key[0]))
    n = len(M1.SIGNS[key[0]])
    rows = []
    for H, phi in R.LOADS:
        fh = M1.hose_f(key, H, phi)
        cell = []
        for F in (M1.F_HI / 2, M1.F_HI):
            cm = M1.contact(r, q, F, M1.TOOL_KG, np.asarray(fh, float))
            ok_h = ok_m = 0
            for combo in itertools.product((-1.0, 1.0), repeat=n):
                fn, _ = GQ0.solve(cm, "hold", legs, np.array(combo), M1.TAUF, hold_idx=hold)
                if fn is None:
                    continue
                ok_h += 1
                rr, kap, d = M1.PL.margin_rows(cm.tau(fn), legs, M1.TAUF)
                t, _ = M1.PL.margin_lp(cm, rr, kap, d)
                ok_m += t is not None
            cell.append((ok_h, ok_m))
        rows.append((H, round(math.degrees(phi)), cell))
    return key, 2 ** n, rows


def coverage(args):
    n, H = args
    R.R47.set_tier(True)
    M1.GAPR = R43.gaps(M1, n, "braked")
    keys = [k for k in M1.KEYS if k[0] == n]
    miss = {k: 0 for k in keys}
    cases = 0
    for i in M1.phis_for(H):
        phi = M1.PHIS[i] if H > 0 else 0.0
        for a in M1.AXES:
            rg = M1.residuals(n, H, phi, R45.B_E * a, R45.S_STAR)
            cases += 1
            for k in keys:
                miss[k] += k not in rg
    return n, H, cases, {str(list(k[1:])): v for k, v in miss.items()}


if __name__ == "__main__":
    with M1.mp.get_context("fork").Pool(4) as pool:
        tabs = pool.map(load_table, NOPLAN, chunksize=1)
        cov = pool.map(coverage, [(n, H) for n in ("g1", "h1") for H in R45.HB], chunksize=1)
    print("# Milestone 48 post hoc: poses with no side that holds at every hose load")
    print("## 1. robot | pose | loads at which no side combination has a plan at either window end "
          "[H, phi: combinations with a hold solution / with a margin, 25 N end; 50 N end]")
    for key, nc, rows in tabs:
        bad = [(H, p, c) for H, p, c in rows if any(m == 0 for _, m in c)]
        print(f"  {key[0]} {list(key[1:])} ({nc} combinations) | {len(bad)} of {len(rows)} loads: "
              + "; ".join(f"[{H:g}, {p}: {c[0][0]}/{c[0][1]}, {c[1][0]}/{c[1][1]}]" for H, p, c in bad))
    print("## 2. Section D's sweep: swept cases with no plan (dropped from the worst residual), per pose on milestone "
          "48's sides: robot | H | cases per pose | poses with any dropped case: pose dropped")
    tot = {}
    for n, H, cases, miss in cov:
        hit = {k: v for k, v in miss.items() if v}
        tot[n] = tot.get(n, 0) + sum(miss.values())
        print(f"  {n} | {H:4.1f} | {cases} | " + (", ".join(f"{k} {v}" for k, v in hit.items()) or "none"))
    for n, v in tot.items():
        allc = sum(c * len([k for k in M1.KEYS if k[0] == n]) for m, H, c, _ in cov if m == n)
        print(f"  {n}: {v} of {allc} pose-cases dropped")
    print(f"\n(run time {time.time() - T0:.0f} s)")

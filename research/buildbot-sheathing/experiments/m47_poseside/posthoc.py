"""Milestone 47 post hoc (after the run; not registered): where the G1's residual regression on S* comes from.

1. Check: the G1 on milestone 32/41's per-robot sides reproduces milestone 41's worst residual in this harness.
2. Per G1 pose, the worst residual along the wall ('braked', |e| 0.2 N, S 10 N, H 0/5/20 N) on the per-robot sides
   and on S*, with the moving joints that flip at the S* worst case.
"""
import importlib.util
import json
import math
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m47", os.path.join(HERE, "run.py"))
R = importlib.util.module_from_spec(spec)
sys.modules["m47"] = R
spec.loader.exec_module(R)
M1, R45, R43 = R.M1, R.R45, R.R43
T0 = time.time()
RES = json.load(open(os.path.join(HERE, "results.json")))
STAR = {("g1",) + tuple(a["pose"]): np.array(a["sstar"]) for a in RES["A"] if a["robot"] == "g1"}
KEYS = sorted(k for k in M1.KEYS if k[0] == "g1")


def per_pose(args):
    on, H = args
    R.SIDE.clear()
    if on:
        R.SIDE.update(STAR)
    R.set_tier(True)
    M1.GAPR = R43.gaps(M1, "g1", "braked")
    best = {}
    for i in M1.phis_for(H):
        phi = M1.PHIS[i] if H > 0 else 0.0
        for a in M1.AXES:
            e = R45.B_E * a
            for key, mu in M1.residuals("g1", H, phi, e, R45.S_STAR).items():
                y = abs(mu["y"][0]) / M1.MM
                if key not in best or y > best[key]["y"]:
                    best[key] = {"y": y, "phi": round(math.degrees(phi)), "e": [float(x) for x in e]}
    for k, b in best.items():
        ta, tp = M1.plan(k, M1.hose_f(k, H, math.radians(b["phi"])), np.array(b["e"]), R45.S_STAR)[:2]
        cnt = {"hold": 0, "leg": 0, "waist": 0, "arm": 0}
        for j in np.flatnonzero(R45.PL0.flips(ta, tp, M1.TAUF) & M1.POSE[k].rows[2]):
            cnt[M1.kind("g1", j)] += 1
        b["flips"] = cnt
    return on, H, {str(list(k[1:])): v for k, v in best.items()}


if __name__ == "__main__":
    with M1.mp.get_context("fork").Pool(4) as pool:
        res = pool.map(per_pose, [(on, H) for on in (False, True) for H in R45.HB], chunksize=1)
    B = {(on, H): b for on, H, b in res}
    m41 = json.load(open(os.path.join(HERE, "..", "m41_stance0", "results.json")))
    W41 = {x["H"]: x["worst"]["all"]["y"] for x in m41["B"] if x["robot"] == "g1"}
    print("# Milestone 47 post hoc: the G1's residual on per-robot sides and on S*")
    print("## 1. Check: G1 worst over all poses on per-robot sides, this harness | milestone 41")
    chk = 0.0
    for H in R45.HB:
        w = max(v["y"] for v in B[(False, H)].values())
        chk = max(chk, abs(round(w, 3) - round(W41[H], 3)))
        print(f"  H {H:4.1f} | {w:.3f} | {W41[H]:.3f}")
    print(f"check: reproduces milestone 41 to {chk:.3f} mm (expect 0.000)")
    print("## 2. Per G1 pose, worst residual along the wall (mm): pose | H 0 per-robot, S* | H 5 per-robot, S* "
          "[flips hold/leg/waist/arm on S*] | H 20 per-robot, S* [flips]")
    for k in KEYS:
        s = str(list(k[1:]))
        cells = []
        for H in R45.HB:
            a, b = B[(False, H)].get(s), B[(True, H)].get(s)
            f = "" if b is None else " [" + "/".join(str(b["flips"][t]) for t in ("hold", "leg", "waist", "arm")) + "]"
            cells.append(("-" if a is None else f"{a['y']:.3f}") + ", " + ("-" if b is None else f"{b['y']:.3f}") + f)
        print(f"  {s} | " + " | ".join(cells))
    n_up = {H: sum(1 for k in KEYS if B[(True, H)].get(str(list(k[1:])), {}).get("y", 0)
                   > B[(False, H)].get(str(list(k[1:])), {}).get("y", 0) + 0.0005) for H in R45.HB}
    print("G1 poses whose worst residual rises by more than 0.0005 mm on S*: "
          + ", ".join(f"H {H:g}: {n} of {len(KEYS)}" for H, n in n_up.items()))
    print(f"\n(run time {time.time() - T0:.0f} s)")

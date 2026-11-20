"""Post-hoc (not registered): the sensor bound each planned press could be certified to under the gate.

D_k is |v0_k(f_m)| + B ||grad v0_k||. If the no-flip residual is linear in the load (checked: median D_k/B per row
is the same at every B_plan), the largest bias the gate admits for a press is B* = min_k (SPEC - Y_k) / (D_k / B).
Reads results.json; writes nothing. python experiments/m66_directterm/diag.py > diag.out"""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC, AX = D["spec_mm"], ("y", "z", "yd", "zd")


def planned(r):
    if "out" not in r:
        return None
    if r["out"].get("y") is not None:
        return r["out"]
    e = r.get("esc", {})
    if e.get("Mu") is not None and e.get("u"):
        return e["u"]
    if e.get("S") is not None and e.get("s"):
        return e["s"]
    return None


print("## Linearity: median D_k / B (mm per N) per row | robot | B_plan")
print("## B*: robot | B_plan | presses | median B* N | 10th pct | share B* >= 0.2 N | share >= 0.3 N | "
      "median worst |r|/B (mm per N, the margin-aimed bias) | median max_k D_k/B")
for n in ("g1", "h1"):
    for b in D["bplans"]:
        bs, rat, rr = [], {a: [] for a in AX}, []
        for x in D["runs"]:
            if x["robot"] != n:
                continue
            for rec in x["rows"]:
                for c in (f"B{b:g}+", f"B{b:g}-"):
                    p = planned(rec["cases"][c])
                    if p is None:
                        continue
                    g = [d / b for d in p["D"]]
                    for a, v in zip(AX, g):
                        rat[a].append(v)
                    bs.append(min((SPEC - y) / v for y, v in zip(p["Y"], g)))
                    rr.append((max(p[a] for a in AX) / b, max(g)))
        bs = np.array(bs)
        print(f"  {n} | {b:.1f} | lin " + ", ".join(f"{a} {np.median(v):.4f}" for a, v in rat.items())
              + f" | {len(bs)} | {np.median(bs):.3f} | {np.percentile(bs, 10):.3f} | {np.mean(bs >= 0.2):.3f} | "
              f"{np.mean(bs >= 0.3):.3f} | {np.median([u for u, _ in rr]):.4f} | {np.median([v for _, v in rr]):.4f}")

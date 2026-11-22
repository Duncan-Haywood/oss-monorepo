"""Post-hoc diagnostic for milestone 68 (not registered): python experiments/m68_jgate/diag.py > diag.out.

1. How large is the flip budget Y_k on planned presses, and does the gate ever refuse a press for Y rather than for
   the table term alone (B max_k ||J_k|| > 0.03 mm)?
2. How tight is the bound: on gate-passed presses, the realised worst row against max_k (Y_k + B ||J_k||).
3. Coverage per pose: which poses the gate admits at each B (the certified bias per pose, 0.03 / max_k ||J_k||)."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC, BS, TAB = D["spec_mm"], D["bs"], D["table"]
AX = ("y", "z", "yd", "zd")


def planned(r):
    if "out" not in r:
        return None
    if r["out"].get("y") is not None:
        return r["out"]
    e = r.get("esc", {})
    for k, m in (("u", "Mu"), ("s", "S")):
        if e.get(m) is not None and e.get(k):
            return e[k]
    return None


print("# Milestone 68 diagnostic (post hoc, not registered)")
print("\n## 1. Flip budget and why the gate refuses: robot | B N | adversary | planned | max Y_k mm | presses with any "
      "Y_k > 0 | refused | refused by the table term alone | refused only because of Y")
for n in ("g1", "h1"):
    for b in BS:
        for a in ("dir", "m63"):
            pl = ypos = ref = tab_only = y_only = 0
            ym = 0.0
            for x in D["runs"]:
                if x["robot"] != n:
                    continue
                for rec in x["rows"]:
                    gn = TAB[n][str(rec["pose"])]
                    for sc in ("+", "-"):
                        p = planned(rec["cases"][f"{a}{b:g}{sc}"])
                        if p is None:
                            continue
                        pl += 1
                        ym = max(ym, max(p["Y"]))
                        ypos += max(p["Y"]) > 0
                        jt = b * max(gn) > SPEC + 1e-12
                        ok = all(y + b * g <= SPEC + 1e-12 for y, g in zip(p["Y"], gn))
                        if not ok:
                            ref += 1
                            tab_only += jt
                            y_only += not jt
            print(f"  {n} | {b:.1f} | {a} | {pl} | {ym:.4f} | {ypos} | {ref} | {tab_only} | {y_only}")
print("\n## 2. Tightness on gate-passed presses: robot | B N | adversary | gate-passed | median, max of realised worst "
      "row / max_k (Y_k + B ||J_k||) | smallest gap to the spec mm")
for n in ("g1", "h1"):
    for b in BS:
        for a in ("dir", "m63"):
            rat, gap = [], []
            for x in D["runs"]:
                if x["robot"] != n:
                    continue
                for rec in x["rows"]:
                    gn = TAB[n][str(rec["pose"])]
                    for sc in ("+", "-"):
                        p = planned(rec["cases"][f"{a}{b:g}{sc}"])
                        if p is None or not all(y + b * g <= SPEC + 1e-12 for y, g in zip(p["Y"], gn)):
                            continue
                        w = max(p[k] for k in AX)
                        bd = max(y + b * g for y, g in zip(p["Y"], gn))
                        if bd > 1e-9:
                            rat.append(w / bd)
                        gap.append(SPEC - w)
            if rat:
                print(f"  {n} | {b:.1f} | {a} | {len(gap)} | {np.median(rat):.3f}, {max(rat):.3f} | {min(gap):.4f}")
print("\n## 3. Certified bias per pose, 0.03 / max_k ||J_k|| (N; inf where J = 0), and the gate's admitted poses: "
      "robot | poses | sorted certified bias")
for n in ("g1", "h1"):
    v = sorted(SPEC / max(g) if max(g) > 1e-9 else float("inf") for g in TAB[n].values())
    print(f"  {n} | {len(v)} | " + ", ".join("inf" if x == float("inf") else f"{x:.3f}" for x in v))

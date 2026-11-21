"""Post-hoc diagnostic for milestone 67 (not registered): python experiments/m67_aimeddirect/diag.py > diag.out.

1. Is the zero-bias no-flip residual zero, and is the response along the aimed direction linear? Per flip-free
   planned press, |r_k*(+/-B u)| against B ||J_k*||.
2. The gradient's four chain runs took the same plan path (how, flips, sides) for only part of the presses; are the
   sensitivities of those presses different from the rest?
3. The bias each press is certified to by its measured sensitivity, B* = 0.03 / max_k ||J_k|| (no flip), against
   milestone 66's B* from D."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC, BS, H = D["spec_mm"], D["bs"], D["h"]
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


print("# Milestone 67 diagnostic (post hoc, not registered)")
print("\n## 1. Zero-bias residual and linearity: robot | presses | max |R(0)| over rows mm | flip-free aimed cases | "
      "max | |r_k*| - B ||J_k*|| | mm | median, min, max of |r_k*| / (B ||J_k*||), ||J_k*|| > 1e-6")
for n in ("g1", "h1"):
    ads = [(x, rec) for x in D["runs"] if x["robot"] == n for rec in x["rows"] if rec["adv"]["src"] == "direct"]
    r0 = max(max(abs(v) for v in rec["adv"]["R0"]) for _, rec in ads)
    dev, rat = [], []
    for _, rec in ads:
        a = rec["adv"]
        ks = AX.index(a["row"])
        g = max(a["gn"])
        for b in BS:
            for sc in ("+", "-"):
                p = planned(rec["cases"][f"B{b:g}{sc}"])
                if p is None or p["flips"]:
                    continue
                dev.append(abs(abs(p["s0"][ks]) - b * g))
                if g > 1e-6:
                    rat.append(abs(p["s0"][ks]) / (b * g))
    print(f"  {n} | {len(ads)} | {r0:.2e} | {len(dev)} | {max(dev):.2e} | {np.median(rat):.4f}, {min(rat):.4f}, {max(rat):.4f}")
print("\n## 2. Same plan path at the four gradient points or not: robot | path | presses | median, max ||J_k*|| mm/N | "
      "median ratio ||J_k*|| / max_k D_k/B")
for n in ("g1", "h1"):
    ads = [rec["adv"] for x in D["runs"] if x["robot"] == n for rec in x["rows"] if rec["adv"]["src"] == "direct"]
    for lab, sel in (("same", True), ("changed", False)):
        s = [a for a in ads if a["same"] == sel]
        g = [max(a["gn"]) for a in s]
        r = [max(a["gn"]) / (max(a["D0"]) / H) for a in s if max(a["D0"]) > 0]
        print(f"  {n} | {lab} | {len(s)} | {np.median(g):.4f}, {max(g):.4f} | {np.median(r):.3f}")
print("\n## 3. Certified bias from the measured sensitivity, B* = 0.03 / max_k ||J_k|| (no-flip part only): robot | "
      "presses | min | 10th pct | median N | presses under 0.2 N | under 0.3 N | milestone 66's B* from D at the same "
      "press, median N")
for n in ("g1", "h1"):
    ads = [rec["adv"] for x in D["runs"] if x["robot"] == n for rec in x["rows"] if rec["adv"]["src"] == "direct"]
    bs = np.array([SPEC / max(a["gn"]) for a in ads])
    bd = np.array([min((SPEC - y) / (d / H) for y, d in zip(a["Y0"], a["D0"])) for a in ads])
    print(f"  {n} | {len(bs)} | {bs.min():.3f} | {np.percentile(bs, 10):.3f} | {np.median(bs):.3f} | "
          f"{int(np.sum(bs < 0.2))} | {int(np.sum(bs < 0.3))} | {np.median(bd):.3f}")
print("\n## 4. A gate on the measured sensitivity at 0.2 N, Y_k + 0.2 ||J_k|| <= 0.03 mm in every row (Y_k the flip "
      "budget of the zero-bias plan sized to 0.2 N): robot | presses | pass | pass % | milestone 66's gate "
      "Y_k + D_k <= 0.03 at the same presses | worst row of Y_k + 0.2 ||J_k|| mm")
for n in ("g1", "h1"):
    ads = [rec["adv"] for x in D["runs"] if x["robot"] == n for rec in x["rows"] if rec["adv"]["src"] == "direct"]
    tot = [max(y + H * g for y, g in zip(a["Y0"], a["gn"])) for a in ads]
    pj = sum(t <= SPEC + 1e-12 for t in tot)
    pd = sum(all(y + d <= SPEC + 1e-12 for y, d in zip(a["Y0"], a["D0"])) for a in ads)
    print(f"  {n} | {len(ads)} | {pj} | {100.0 * pj / len(ads):.1f} | {pd} | {max(tot):.4f}")
print("\n## 5. Does J depend on the load? robot | poses | most distinct max_k ||J_k|| (6 decimals) at one pose over the "
      "loads | presses with ||J|| = 0 (poses)")
for n in ("g1", "h1"):
    by = {}
    for x in D["runs"]:
        if x["robot"] != n:
            continue
        for rec in x["rows"]:
            if rec["adv"]["src"] == "direct":
                by.setdefault(tuple(rec["pose"]), set()).add(round(max(rec["adv"]["gn"]), 6))
    z = [p for p, v in by.items() if max(v) < 1e-6]
    print(f"  {n} | {len(by)} | {max(len(v) for v in by.values())} | {z}")

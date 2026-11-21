"""Figure for milestone 67: python experiments/m67_aimeddirect/figure.py (reads results.json).

Left: per press, the full sensitivity of the aimed row through the chain (calibration re-made under the bias),
||J_k*||, against milestone 66's direct term max_k D_k/B at the same press. Right: the worst row of each planned
press under the aimed bias, against the bias size B (planner sized to B), with the 0.03 mm spec."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

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


fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 4.4))
top = 0.0
for i, (n, col) in enumerate((("g1", "C0"), ("h1", "C3"))):
    ads = [rec["adv"] for x in D["runs"] if x["robot"] == n for rec in x["rows"] if rec["adv"]["src"] == "direct"]
    xs = [max(a["D0"]) / H for a in ads]
    ys = [max(a["gn"]) for a in ads]
    top = max([top] + xs + ys)
    a1.scatter(xs, ys, s=14, color=col, alpha=0.7, label=f"{n.upper()} ({len(ads)} presses)")
    for j, b in enumerate(BS):
        w = []
        for x in D["runs"]:
            if x["robot"] != n:
                continue
            for rec in x["rows"]:
                for sc in ("+", "-"):
                    p = planned(rec["cases"][f"B{b:g}{sc}"])
                    if p is not None:
                        w.append(max(p[a] for a in AX))
        xj = b + (i - 0.5) * 0.012 + np.random.default_rng(j + 10 * i).uniform(-0.004, 0.004, len(w))
        a2.scatter(xj, w, s=8, color=col, alpha=0.5, label=f"{n.upper()}" if j == 0 else None)
lim = top * 1.05
a1.plot([0, lim], [0, lim], "k-", lw=0.8, label="equal")
a1.plot([0, lim], [0, lim / 2], "k:", lw=0.8, label="half (H258)")
a1.set_xlim(0, lim)
a1.set_ylim(0, lim)
a1.set_xlabel("milestone 66's direct term, max_k D_k / B (mm per N)")
a1.set_ylabel("full sensitivity, calibration re-made, ||J_k*|| (mm per N)")
a2.axhline(SPEC, color="k", lw=0.8, ls="--", label=f"spec {SPEC} mm")
a2.set_xticks(BS)
a2.set_xlabel("aimed bias B = planner bound (N)")
a2.set_ylabel("worst row of a planned press (mm)")
for a in (a1, a2):
    a.grid(alpha=0.3)
    a.legend(fontsize=8)
fig.suptitle(f"Milestone 67: a bias aimed at the direct term (held-out section N, seed {D['seed']})", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")

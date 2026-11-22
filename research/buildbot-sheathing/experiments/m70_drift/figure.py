"""Figure for milestone 70: python experiments/m70_drift/figure.py (reads results.json).

Left: each pose's two-pose bias rating 0.03 mm / max_k ||J_k|| and drift rating 0.03 mm / max_k ||S_k|| against its
grip height, from the S measured in this run. Right: drift-gate coverage of the balance-envelope cases against the
drift bound delta, per robot and bias bound B, with the number of presses the drift-blind gate passed that left
0.03 mm written beside each point."""
import json
import os

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC, BS, DS, G = D["spec_mm"], D["bs"], D["ds"], D["G"]

fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 4.4))
for n, col, dx in (("g1", "C0", -0.012), ("h1", "C3", 0.012)):
    pj, ps = {}, {}
    for x in D["runs"]:
        if x["robot"] != n:
            continue
        for rec in x["rows"]:
            if rec["S"] is None:
                continue
            p = tuple(rec["pose"])
            pj[p] = float(np.linalg.norm(np.array(rec["J"]), axis=1).max())
            ps[p] = float(np.linalg.norm(np.array(rec["S"]), axis=1).max())
    cap = lambda g: min(SPEC / g, 2.0) if g > 1e-12 else 2.0  # noqa: E731
    a1.scatter([p[0] + dx for p in pj], [cap(g) for g in pj.values()], marker="s", s=28, edgecolors=col,
               facecolors=col, label=f"{n.upper()}, bias rating (two references)")
    a1.scatter([p[0] + dx for p in ps], [cap(g) for g in ps.values()], marker="o", s=28, edgecolors=col,
               facecolors="none", label=f"{n.upper()}, drift rating")
a1.set_yscale("log")
a1.set_xlabel("grip height of the pose, m")
a1.set_ylabel("rating, N (0.03 mm / max row norm; capped at 2)")
a1.set_title("Calibration cancels the bias, not the drift")
a1.legend(fontsize=7, loc="upper left")
for n, col in (("g1", "C0"), ("h1", "C3")):
    for b, ls in zip(BS, ("-", ":")):
        ys = [G[f"{n} {b:g} {d:g}"]["ncov"] for d in DS]
        a2.plot(DS, ys, ls, color=col, marker="o", label=f"{n.upper()}, B = {b:g} N")
        for d, y in zip(DS, ys):
            o = G[f"{n} {b:g} {d:g}"]["oldover"]
            if o:
                a2.annotate(str(o), (d, y), textcoords="offset points", xytext=(4, 3), fontsize=6, color=col)
a2.set_xlabel("drift bound delta between calibration and press, N")
a2.set_ylabel("drift-gate coverage of balance-envelope cases, %")
a2.set_ylim(0, 105)
a2.set_title("Drift gate coverage (numbers: drift-blind gate failures)")
a2.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")

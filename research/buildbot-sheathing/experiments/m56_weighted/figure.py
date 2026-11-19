"""Figure for milestone 56: python experiments/m56_weighted/figure.py (reads results.json and m55's)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
P55 = os.path.join(HERE, "..", "m55_robust", "results.json")
D55 = json.load(open(P55)) if os.path.exists(P55) else None
SPEC = D["spec_mm"]
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4))

# left: the bound Y against the flip shift the robot actually showed, every planned in-envelope case
xs, ys = [], []
for x in D["runs"]:
    for r in x["rows"]:
        if r.get("in51") and r.get("y") is not None:
            xs.append(r["Y"])
            ys.append(r["y"] - r["y_noflip"])
ax1.scatter(xs, ys, s=8, color="C0", alpha=0.5, label="planned in-envelope cases (all sections)")
m = max(max(xs, default=0), D["budget_mm"]) * 1.1
ax1.plot([0, m], [0, m], color="k", lw=0.8, ls="--", label="shift = bound Y")
ax1.axvline(D["budget_mm"], color="C2", lw=1.2, ls=":", label=f"budget {D['budget_mm']:.3f} mm")
ax1.set_xlabel("flip bound Y from the measured load (mm)")
ax1.set_ylabel("|y| minus |y| with the plan's held states (mm)")
ax1.set_title("The bound is never beaten (points on or below the line)", fontsize=10)
ax1.legend(fontsize=6, loc="upper left")

# right: coverage inside milestone 51's envelope, milestone 55's robust rule against the weighted rule
labels, c55, c56 = [], [], []
for sec in ("A", "B", "C"):
    for robot in ("g1", "h1"):
        labels.append(f"{sec} {robot.upper()}")
        c56.append(D["S"][f"{sec} {robot}"]["cov"])
        c55.append(D55["S"][f"{sec} {robot}"]["cov"] if D55 and f"{sec} {robot}" in D55["S"] else None)
xi = range(len(labels))
ax2.bar([i - 0.2 for i in xi], [c if c is not None else 0 for c in c55], width=0.4, color="C3",
        label="milestone 55: margin on every joint")
ax2.bar([i + 0.2 for i in xi], c56, width=0.4, color="C0", label="milestone 56: margin weighted by nose cost")
for i, c in enumerate(c56):
    ax2.text(i + 0.2, c + 0.3, f"{c:.1f}", ha="center", fontsize=7)
for i, c in enumerate(c55):
    if c is None:
        ax2.text(i - 0.2, 90.5, "not run", ha="center", fontsize=6, rotation=90)
    else:
        ax2.text(i - 0.2, c + 0.3, f"{c:.1f}", ha="center", fontsize=7)
ax2.axhline(99, color="k", lw=0.8, ls=":")
ax2.set_xticks(list(xi))
ax2.set_xticklabels(labels)
ax2.set_ylim(90, 102)
ax2.set_ylabel("in-envelope pose-cases planned (%)")
ax2.set_title("Coverage (A: m54 loads, B: m55 fresh, C: new fresh)", fontsize=10)
ax2.legend(fontsize=6, loc="lower left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")

"""Figure for milestone 55: python experiments/m55_robust/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC = D["spec_mm"]
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4))

# left: worst in-envelope |y| per load, milestone 54's rule against the robust rule, fresh section-B loads
for key, mk, col, lab in (("y_base", "o", "C3", "milestone 54's rule"), ("y", "s", "C0", "robust rule")):
    for robot, dx in (("g1", -0.15), ("h1", 0.15)):
        xs, ys = [], []
        for x in D["runs"]:
            if x["sec"] != "B" or x["robot"] != robot:
                continue
            yy = [r[key] for r in x["rows"] if r["in51"] and r.get(key) is not None]
            if yy:
                xs.append(x["H"] + dx)
                ys.append(max(yy))
        ax1.scatter(xs, ys, marker=mk, s=18, facecolor=col if robot == "g1" else "none", edgecolor=col, lw=0.8,
                    label=f"{lab}, {robot.upper()}")
ax1.axhline(SPEC, color="C2", lw=1.5, ls="--")
ax1.text(14, SPEC * 1.06, "0.03 mm spec", color="C2", fontsize=7)
ax1.set_yscale("log")
ax1.set_xlabel("hose drag at the load (N; fresh seed-55 loads, off-axis sensor errors)")
ax1.set_ylabel("worst in-envelope |y| over poses and errors (mm)")
ax1.set_ylim(0.007, 0.05)
ax1.set_title("Fresh loads: both rules in spec, the robust one tighter", fontsize=10)
ax1.legend(fontsize=6, loc="upper left")

# right: coverage inside milestone 51's envelope by section and robot, and how each case was planned
S = D["S"]
labels, pose, per, none = [], [], [], []
for sec in ("A", "B"):
    for robot in ("g1", "h1"):
        rr = [r for x in D["runs"] if x["sec"] == sec and x["robot"] == robot for r in x["rows"] if r["in51"]]
        n = max(len(rr), 1)
        labels.append(f"{sec} {robot.upper()}")
        pose.append(100 * sum(r["how"] == "pose sides" and r["y"] is not None for r in rr) / n)
        per.append(100 * sum(r["how"] == "per-load sides" and r["y"] is not None for r in rr) / n)
        none.append(100 * sum(r["y"] is None for r in rr) / n)
xs = range(len(labels))
ax2.bar(xs, pose, color="C0", label="robust plan on the pose's sides")
ax2.bar(xs, per, bottom=pose, color="C9", label="robust plan on per-load sides")
ax2.bar(xs, none, bottom=[a + b for a, b in zip(pose, per)], color="C3", label="no robust plan")
for i, (a, b) in enumerate(zip(pose, per)):
    ax2.text(i, 101, f"{a + b:.1f}%", ha="center", fontsize=8)
ax2.axhline(99, color="k", lw=0.8, ls=":")
ax2.text(3.45, 97.6, "99%", fontsize=7, ha="right")
ax2.set_xticks(list(xs))
ax2.set_xticklabels(labels)
ax2.set_ylim(80, 104)
ax2.set_ylabel("in-envelope pose-cases (%)")
ax2.set_title("Coverage: what the margin costs (A: m54 loads, B: fresh)", fontsize=10)
ax2.legend(fontsize=6, loc="lower left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")

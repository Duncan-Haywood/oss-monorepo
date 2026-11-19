"""Figure for milestone 51: python experiments/m51_envelope/figure.py (reads results.json and posthoc.txt)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
cls = {}
for line in open(os.path.join(HERE, "posthoc.txt")):
    p = [s.strip() for s in line.split("|")]
    if len(p) == 3 and p[0] in ("g1", "h1") and p[2].isdigit():
        cls[(p[0], p[1])] = int(p[2])
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.2))
robots = ["g1", "h1"]
S = D["summary"]
cats = [("outside the envelope (stance limit)", "0.55"),
        ("calibration, plan limit", "C3"), ("calibration, sensor error", "C1"),
        ("own pose, plan limit", "C0"), ("own pose, sensor error", "C2")]
for j, n in enumerate(robots):
    ss = [v for k, v in S.items() if k.startswith(n)]
    outside = sum(v["dropped"] - v["dropped_inside"] for v in ss)
    vals = [outside] + [cls.get((n, c), 0) for c, _ in cats[1:]]
    bottom = 0
    for (c, col), v in zip(cats, vals):
        ax1.bar(j, v, 0.55, bottom=bottom, color=col, label=c if j == 0 else None)
        bottom += v
    ax1.text(j, bottom + 4, f"{bottom} of {sum(v['cases'] for v in ss)}", ha="center", fontsize=8)
ax1.set_xticks(range(2), [n.upper() for n in robots])
ax1.set_ylabel("swept pose-cases with no plan")
ax1.set_title("Why milestone 48's sweep drops cases", fontsize=10)
ax1.legend(fontsize=7)
Hs = [0.0, 5.0, 20.0]
w = 0.35
for j, n in enumerate(robots):
    ys = [S[f"{n} {H:g}"]["worst_inside"] * 1e3 for H in Hs]
    ax2.bar([k + (j - 0.5) * w for k in range(3)], ys, w, color=f"C{j}", label=n.upper())
ax2.axhline(30, color="0.25", ls="--", lw=1)
ax2.set_xticks(range(3), [f"{H:g} N" for H in Hs])
ax2.set_xlabel("hose drag swept")
ax2.set_ylabel("worst residual along the wall inside the envelope (µm)")
ax2.set_title("Inside the drag envelope both robots stay in spec (dashed: 30 µm)", fontsize=10)
ax2.legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")

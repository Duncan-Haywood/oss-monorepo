"""Figure for milestone 38: python experiments/m38_squeeze/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
MM = 1e-3
SQ = R["S"]


def worst(n, S, H, b):
    w = [x for x in R["B"] if x["robot"] == n and x["S"] == S and x["H"] == H and x["b"] == b][0]["worst"]
    return None if w is None else abs(w["y"]) / MM


fig, axes = plt.subplots(1, 3, figsize=(14, 4.4))
for ax, b, title, ref in ((axes[0], 0.2, "FT 300 (|e| 0.2 N), leg preload 0.1 N m", 0.1),
                          (axes[1], 2.4, "pre-2017 FT 300 (|e| 2.4 N)", 0.3)):
    for j, n in enumerate(("g1", "h1")):
        for H, ls in zip(R["H"], ("-", "--", ":")):
            ax.plot(SQ, [worst(n, S, H, b) for S in SQ], ls, marker="o", ms=3, color=f"C{j}",
                    label=f"{n.upper()}, drag {H:g} N")
    ax.axhline(ref, color="0.5", lw=0.8)
    ax.set_xlabel("squeeze bound S (N)")
    ax.set_ylabel("worst residual along the wall (mm)")
    ax.set_title(title)
    ax.legend(fontsize=7)

ax = axes[2]
kinds = ("hold", "leg", "waist", "arm")
labels = ("hold set", "other leg", "waist", "arm")
bottom = [0] * len(SQ)
for k, lab, c in zip(kinds, labels, ("C2", "C3", "C4", "C1")):
    v = [R["census_total"][str(S)][k] for S in SQ]
    ax.bar([str(int(S)) for S in SQ], v, bottom=bottom, color=c, label=lab)
    bottom = [a + b for a, b in zip(bottom, v)]
ax.set_xlabel("squeeze bound S (N)")
ax.set_ylabel("mispredicted joint-pose cases")
ax.set_title("joints that still flip (|e| 0.2 N, H 0/5/20 N)")
ax.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")

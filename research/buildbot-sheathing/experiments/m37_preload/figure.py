"""Figure for milestone 37: python experiments/m37_preload/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
MM = 1e-3
M = R["margins"]


def worst(n, m, H, b, g="0.0"):
    r = [x for x in R["B"] if x["robot"] == n and x["m"] == m and x["H"] == H and x["b"] == b][0]["worst"][g]
    return None if r is None else abs(r["y"]) / MM


fig, axes = plt.subplots(1, 3, figsize=(14, 4.4))
ax = axes[0]
for j, n in enumerate(("g1", "h1")):
    for H, ls in zip(R["H"], ("-", "--", ":")):
        ax.plot(M, [worst(n, m, H, 0.2) for m in M], ls, marker="o", ms=3, color=f"C{j}",
                label=f"{n.upper()}, drag {H:g} N")
ax.axhline(0.1, color="0.5", lw=0.8)
ax.set_xlabel("preload margin m (N m)")
ax.set_ylabel("worst residual along the wall (mm)")
ax.set_title("FT 300 (|e| 0.2 N): residual against the preload")
ax.legend(fontsize=7)

ax = axes[1]
for j, n in enumerate(("g1", "h1")):
    for H, ls in zip(R["H"], ("-", "--", ":")):
        ax.plot(M, [worst(n, m, H, 2.4) for m in M], ls, marker="^", ms=3, color=f"C{j}",
                label=f"{n.upper()}, drag {H:g} N")
ax.axhline(0.3, color="0.5", lw=0.8)
ax.set_xlabel("preload margin m (N m)")
ax.set_ylabel("worst residual along the wall (mm)")
ax.set_title("pre-2017 FT 300 (|e| 2.4 N)")
ax.legend(fontsize=7)

ax = axes[2]
gs = R["g"]
for j, n in enumerate(("g1", "h1")):
    ax.plot(gs, [worst(n, 0.0, 5.0, 0.2, str(g)) for g in gs], "o-", ms=3, color=f"C{j}", label=f"{n.upper()}, m 0")
    ax.plot(gs, [worst(n, R["m_star"], 5.0, 0.2, str(g)) for g in gs], "s--", ms=3, color=f"C{j}",
            label=f"{n.upper()}, m {R['m_star']:g}")
ax.set_xlabel("hedge band g (N m)")
ax.set_ylabel("worst residual along the wall (mm)")
ax.set_title("hedged compensator, 5 N drag, |e| 0.2 N")
ax.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")

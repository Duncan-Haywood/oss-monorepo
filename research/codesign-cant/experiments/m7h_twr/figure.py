"""Figure for milestone 7h. Left: held-out flights that diverged at twice the trained centre-of-pressure lever (of 384 per set),
at the 20 and 45 deg tilt-command limits, for 7e's designs as trained (thrust-to-weight 2), the same designs re-sized at the
largest thrust-to-weight whose sizing closes, and designs retrained with thrust-to-weight free. Right: each design's
thrust-to-weight against its hover power. Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
runs = json.load(open(os.path.join(HERE, "results.json")))["runs"]
ARMS = (("retrofit TWR=2.0", "7e as trained (TWR 2)", "#1f77b4", "o"), ("retrofit max", "7e, largest TWR that closes", "#d62728", "s"),
        ("free", "retrained, TWR free", "#2ca02c", "^"))
GEOMS = ("above", "below")

fig, ax = plt.subplots(1, 2, figsize=(12, 4.6))
x = np.arange(4)
for j, (lab, name, col, _) in enumerate(ARMS):
    v = [sum(r[f"dead_{cap:g}_2"] for r in runs if r["label"] == lab and r["geom"] == g) for g in GEOMS for cap in (20.0, 45.0)]
    ax[0].bar(x + (j - 1) * 0.27, v, width=0.27, color=col, label=name)
    for xi, vi in zip(x + (j - 1) * 0.27, v):
        ax[0].text(xi, vi, str(vi), ha="center", va="bottom", fontsize=8)
ax[0].set_xticks(x); ax[0].set_xticklabels([f"{g}, {c}°" for g in GEOMS for c in (20, 45)])
ax[0].set_ylabel("held-out flights diverged at lever 2 (of 384)")
ax[0].set_title("Twice the trained centre-of-pressure lever")
ax[0].legend(fontsize=8)
for lab, name, col, mk in ARMS:
    for g, fill in zip(GEOMS, (True, False)):
        rs = [r for r in runs if r["label"] == lab and r["geom"] == g]
        ax[1].scatter([r["twr"] for r in rs], [r["power"] for r in rs], c=col if fill else "none", edgecolors=col, marker=mk,
                      label=f"{name}, {g}")
ax[1].set_xlabel("thrust-to-weight"); ax[1].set_ylabel("hover power (W)"); ax[1].set_yscale("log")
ax[1].set_title("What the headroom costs (filled: above, open: below)")
ax[1].legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7h_twr.png"), dpi=130)
print("wrote m7h_twr.png")

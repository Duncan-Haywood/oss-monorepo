"""Figure for milestone 6: held-out position and yaw error per arm, side force on and off (left, middle); cost of the side force under both gust-torque signs (right). Reads results.json and dist_sign.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
runs = json.load(open(os.path.join(HERE, "results.json")))["runs"]
ARMS = ("nocant", "aware", "unaware")
NAMES = {"nocant": "no cant", "aware": "cant ≤ 80°\nforce-aware", "unaware": "cant ≤ 80°\nforce ignored"}


def sel(arm, key):
    return np.array([r[key] for r in sorted((r for r in runs if r["arm"] == arm), key=lambda r: r["seed"])])


fig, axes = plt.subplots(1, 3, figsize=(13, 4))
rng = np.random.default_rng(0)
for ax, key, lab in ((axes[0], "pos", "held-out RMS position error (m)"), (axes[1], "yaw", "held-out RMS yaw error (deg)")):
    for i, arm in enumerate(ARMS):
        for j, (tag, col) in enumerate((("on", "#1f77b4"), ("off", "#bbbbbb"))):
            y = sel(arm, f"{key}_{tag}"); x = i + (j - 0.5) * 0.3
            ax.scatter(x + rng.uniform(-0.05, 0.05, len(y)), y, s=16, color=col, alpha=0.85,
                       label=("side force on" if tag == "on" else "side force off (ablation)") if i == 0 else None)
            ax.hlines(np.median(y), x - 0.1, x + 0.1, color="k", lw=1.5)
    ax.set_xticks(range(3)); ax.set_xticklabels([NAMES[a] for a in ARMS]); ax.set_ylabel(lab)
    if key == "pos":
        ax.set_yscale("log")
axes[0].legend(frameon=False, fontsize=8); axes[0].set_title("Position hold, 6 s with a wind step (6 seeds)")
axes[1].set_title("Yaw steps ±30° during the hold")
ds = json.load(open(os.path.join(HERE, "dist_sign.json")))   # dist_sign.py, post-hoc
for i, arm in enumerate(("aware", "unaware")):
    rs = sorted((r for r in ds if r["arm"] == arm), key=lambda r: r["seed"])
    for j, (s, col, lab) in enumerate((("p", "#1f77b4", "gust torque as trained (+1)"), ("m", "#d62728", "gust torque flipped (−1)"))):
        y = np.array([r[f"pos_{s}_on"] / r[f"pos_{s}_off"] for r in rs]); x = i + (j - 0.5) * 0.3
        axes[2].scatter(x + rng.uniform(-0.04, 0.04, len(y)), y, s=16, color=col, alpha=0.85, label=lab if i == 0 else None)
        axes[2].hlines(y.mean(), x - 0.1, x + 0.1, color="k", lw=1.5)
axes[2].axhline(1.0, color="k", lw=0.6); axes[2].axhline(1.2, color="k", lw=0.8, ls="--")
axes[2].text(1.55, 1.21, "H3 line (+20%)", ha="right", va="bottom", fontsize=8)
axes[2].set_xticks(range(2)); axes[2].set_xticklabels([NAMES[a] for a in ("aware", "unaware")]); axes[2].set_xlim(-0.6, 1.6)
axes[2].set_ylabel("position RMS, side force on / off"); axes[2].legend(frameon=False, fontsize=8, loc="upper left")
axes[2].set_title("What the side force costs (bars: mean)")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m6_poshold.png"), dpi=150)
print("wrote m6_poshold.png")

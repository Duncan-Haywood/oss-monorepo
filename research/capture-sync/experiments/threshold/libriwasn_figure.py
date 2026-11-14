"""Figure for step 2b: predicted (cells model) against observed miss share per cell on the LibriWASN phones,
smooth-weight GCC, coloured by window length, from libriwasn_summary.json. Cells with fewer than 10 observed
failures are left out, as in the H4 score.

    python experiments/threshold/libriwasn_figure.py
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(HERE, "libriwasn_summary.json")))
COL = {0.5: "#2b6cb0", 1.0: "#2f855a", 2.0: "#c05621", 4.0: "#9b2c2c"}
MARK = {"200": "o", "800": "^"}

fig, ax = plt.subplots(figsize=(5.2, 4.6))
ax.plot([1e-3, 1], [1e-3, 1], color="k", lw=0.8)
ax.fill_between([1e-3, 1], [5e-4, 0.5], [2e-3, 2], color="0.87", zorder=0, label="within x2")
for L, col in COL.items():
    for room, m in MARK.items():
        cs = [c for c in C if c["L"] == L and c["room"] == room and c["n_fixed"] >= 10]
        ax.scatter([c["fixed"] for c in cs], [c["pred"] for c in cs], s=22, marker=m, color=col,
                   label=f"{L:g} s, {room} ms room", alpha=0.85)
ax.set_xscale("log"); ax.set_yscale("log")
ax.set_xlim(2e-3, 1); ax.set_ylim(2e-3, 1)
ax.set_xlabel("observed miss share (smooth-weight GCC, real phones)")
ax.set_ylabel("predicted miss share (cells model)")
ax.set_title("Step 2b, LibriWASN: the model overpredicts long windows", fontsize=10)
ax.legend(fontsize=7, loc="lower right", ncol=2)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "libriwasn_pred_vs_obs.png"), dpi=150)
print("wrote libriwasn_pred_vs_obs.png")

"""Figure for milestone 49: python experiments/m49_backload/figure.py (reads posthoc.json and results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, "posthoc.json")))
D = json.load(open(os.path.join(HERE, "results.json")))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4), gridspec_kw={"width_ratios": [1.6, 1]})
x = np.arange(len(P))
lab = [f"{c['robot'].upper()} {c['pose'][0]:g},{c['pose'][1]:+g} H{c['H']:g} φ{c['phi']}" for c in P]
ax1.bar(x - 0.2, [c["top_nohose"] for c in P], 0.4, color="C0", label="no hose")
ax1.bar(x + 0.2, [c["press_max"] for c in P], 0.4, color="C3", label="with the cell's hose drag")
ax1.axhline(50, color="0.25", ls="--", lw=1)
ax1.text(-0.5, 66, "dashed: 50 N, the top of the firing press range", fontsize=7, color="0.25")
ax1.set_xticks(x, lab, rotation=90, fontsize=6)
ax1.set_ylabel("largest press the soles can balance, μ 0.5 (N)")
ax1.set_ylim(0, 70)
ax1.set_title("Backward hose drag lowers the top of the press window", fontsize=10)
ax1.legend(fontsize=7, loc="lower right")
key = {(tuple([c["robot"]] + c["pose"]), c["H"], c["phi"]): c for c in D if c["F"] == 50}
sl = [key[(tuple([c["robot"]] + c["pose"]), c["H"], c["phi"])]["slack"] for c in P]
col = ["C2" if c["mu_min"] is not None else ("C1" if c["inf_mu_balances"] else "C3") for c in P]
ax2.barh(x, sl, color=col)
ax2.axvline(0, color="0.25", lw=1)
ax2.set_yticks(x, lab, fontsize=6)
ax2.invert_yaxis()
ax2.set_xlabel("best cone slack at 50 N press (N; < 0: no balance)")
ax2.set_title("No stance balances at 50 N", fontsize=10)
for c, t in (("C2", "friction-limited (balances at μ 0.50-0.56)"),
             ("C1", "needs μ > 5 (balances only with unbounded friction)"),
             ("C3", "no friction balances it (tips back)")):
    ax2.barh([np.nan], [np.nan], color=c, label=t)
ax2.legend(fontsize=6, loc="lower left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")

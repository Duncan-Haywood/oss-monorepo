"""Step 3b figure: wrong among accepted 2 s windows (gamma 0.25) for the three gates, by shift.

    python experiments/gate/noise_figure.py      # reads noise_summary.json, writes noise_gates.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "noise_summary.json")))
COND = [
    ("200->800\npooled", "S2", "200->800|2.0|0.25|None"), ("200->800\n-10 dB", "S2", "200->800|2.0|0.25|-10.0"),
    ("800->200\npooled", "S2", "800->200|2.0|0.25|None"), ("800->200\n-10 dB", "S2", "800->200|2.0|0.25|-10.0"),
    ("phone out\n(worst of 5)", "S3", None),
    ("noise shift\n200 ms room", "S4", "200|2.0|0.25"), ("noise shift\n800 ms room", "S4", "800|2.0|0.25"),
]
GATES = [("pooled", "pooled PSR gate (step 3)", "#4c72b0"),
         ("mondrian", "Mondrian on blind SNR, refuse outside support", "#55a868"),
         ("theory", "threshold-theory score", "#dd8452")]

fig, ax = plt.subplots(figsize=(9.5, 4.4))
x = np.arange(len(COND))
w = 0.27
for i, (g, label, col) in enumerate(GATES):
    vals, kept = [], []
    for _, sec, key in COND:
        if sec == "S3":
            e = max((S["S3"][k] for k in S["S3"] if k.endswith("|2.0|0.25")), key=lambda e: e[g][1])
        else:
            e = S[sec][key]
        kept.append(e[g][0])
        vals.append(100 * (e[g][1] if e[g][2] else 0.0))
    b = ax.bar(x + (i - 1) * w, vals, w, label=label, color=col)
    for r, k in zip(b, kept):
        ax.text(r.get_x() + r.get_width() / 2, r.get_height() + 0.1, f"{k:.0%}", ha="center", fontsize=6.5)
ax.axhline(1, color="k", lw=0.8, ls="--")
ax.axhline(2, color="k", lw=0.8, ls=":")
ax.text(len(COND) - 0.5, 1.05, "target 1%", fontsize=7, ha="right")
ax.set_xticks(x, [c[0] for c in COND], fontsize=8)
ax.set_ylabel("wrong among accepted 2 s windows (%)")
ax.set_title("LTT gates, gamma 0.25, 1% target, calibrate -> test (labels: share of windows kept)", fontsize=9)
ax.legend(fontsize=8, loc="upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "noise_gates.png"), dpi=130)

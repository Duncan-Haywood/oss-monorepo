"""Step 4d figure: mean out-of-sync share over the ten noise types at -10 dB for each tracker, by clock-rate
offset; left the 200 ms room, right the 800 ms room.

    python experiments/baselines/tracker_figure.py   # reads tracker_summary.json, writes tracker_oos.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "tracker_summary.json")))
SROS = [17.0, 100.0, 300.0]
METHODS = [("pw", "paderwasn (coarse sync + online WACD)", "#c44e52"),
           ("fnc_wacd", "env-norm GCC coarse + online WACD", "#dd8452"),
           ("fnc", "env-norm GCC coarse, held", "#bbbbbb"),
           ("track", "env-norm GCC windows + Theil-Sen line", "#4c72b0")]

fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), sharey=True)
x = np.arange(len(SROS))
for ax, rt in zip(axes, ("0.2", "0.8")):
    for k, (m, lab, c) in enumerate(METHODS):
        y = [100 * np.mean([S[f"{rt}|{e}|{t}|{m}"] for t in range(10)]) for e in SROS]
        ax.bar(x + (k - 1.5) * 0.2, y, 0.2, color=c, label=lab)
    ax.set_xticks(x, [f"{e:g} ppm" for e in SROS])
    ax.set_title(f"RT60 {float(rt):.1f} s room, ten noise types at -10 dB", fontsize=9)
    ax.grid(alpha=0.3, axis="y")
axes[0].set_ylabel("share of session more than one 30 fps frame off (%)")
axes[0].legend(fontsize=8, frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "tracker_oos.png"), dpi=130)
print("wrote tracker_oos.png")

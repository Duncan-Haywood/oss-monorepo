"""Failure among accepted 2 s windows under each shift, for the PSR gate (gamma 0.25) and the agree gate.

    python experiments/gate/figure.py      # reads summary.json, writes gate_shifts.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "summary.json")))
COND = [
    ("200->800\npooled", "S2", "200->800|2.0|{g}|None"), ("200->800\n-10 dB", "S2", "200->800|2.0|{g}|-10.0"),
    ("800->200\npooled", "S2", "800->200|2.0|{g}|None"), ("800->200\n-10 dB", "S2", "800->200|2.0|{g}|-10.0"),
    ("phone out\n(worst of 5)", "S3", None),
    ("noise shift\n200 ms room", "S4", "200|2.0|{g}"), ("noise shift\n800 ms room", "S4", "800|2.0|{g}"),
]
GATES = [("psr:0.25", "PSR gate, gamma 0.25", "#4c72b0"), ("agree", "agree gate (PHAT and gamma 0.25 within a frame)", "#dd8452")]

fig, ax = plt.subplots(figsize=(9, 4.2))
x = np.arange(len(COND))
for i, (g, label, col) in enumerate(GATES):
    vals, kept = [], []
    for _, sec, key in COND:
        if sec == "S3":
            e = max((S["S3"][k] for k in S["S3"] if k.endswith(f"|2.0|{g}")), key=lambda e: e["fail_kept"])
        else:
            e = S[sec][key.format(g=g)]
        vals.append(100 * e["fail_kept"])
        kept.append(e["kept"])
    b = ax.bar(x + (i - 0.5) * 0.38, vals, 0.38, label=label, color=col)
    for r, k in zip(b, kept):
        ax.text(r.get_x() + r.get_width() / 2, r.get_height() + 0.1, f"{k:.0%}", ha="center", fontsize=7)
ax.axhline(1, color="k", lw=0.8, ls="--")
ax.axhline(2, color="k", lw=0.8, ls=":")
ax.text(len(COND) - 0.5, 1.05, "target 1%", fontsize=7, ha="right")
ax.text(len(COND) - 0.5, 2.05, "2%", fontsize=7, ha="right")
ax.set_xticks(x, [c[0] for c in COND], fontsize=8)
ax.set_ylabel("wrong among accepted 2 s windows (%)")
ax.set_title("Learn-then-Test gate, 1% target, calibrate -> test (labels: share of windows kept)", fontsize=9)
ax.legend(fontsize=8, loc="upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "gate_shifts.png"), dpi=130)

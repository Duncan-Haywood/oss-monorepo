"""Figure for milestone 78: python experiments/m78_augfilter/figure.py (reads results.json and milestones 75's and 77's).

Mean re-zeros per 100 sheets at a 1% wall risk on the 11 cases whose open-loop optimum needs at least 10, with the
free-air reading's systematic error beta drawn from N(0, 0.02^2 I) N: milestone 77's BALANCE with beta known to be 0
(reference), the naive filter recalibrated for the prior (NAIVE-CAL), the augmented filter (AUG), the augmented filter
with one reading after every tare (AUG+R), and the open-loop optimum (OPT, which needs no reading); a red x marks a case NAIVE-CAL cannot calibrate. s = 0.01 N left,
0.02 N right."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
R75 = json.load(open(os.path.join(HERE, "..", "m75_riskopt", "results.json")))
R77 = json.load(open(os.path.join(HERE, "..", "m77_balance", "results.json")))
SB = 0.02
keys = [k for k in R["rows"] if R75["rows"][k]["OPT"][0] >= 10]
lab = [k.replace("|", " ").replace("BANDS k+0", "BANDS").upper().replace("LAYOUT", "LAY") for k in keys]
SER = [("BALANCE, beta known 0 (m77)", "C7"), ("NAIVE-CAL", "C3"), ("AUG", "C1"), ("AUG+R", "C0"), ("OPT (open loop)", "k")]
fig, axes = plt.subplots(1, 2, figsize=(12, 4.4), sharey=True)
x = np.arange(len(keys))
w = 0.16
for ax, s in zip(axes, R["noise"]):
    for i, (name, col) in enumerate(SER):
        v = []
        for k in keys:
            c = R["rows"][k][f"{s}|{SB}"]
            if name.startswith("BALANCE"):
                v.append(R77["rows"][k][str(s)]["fresh"][1])
            elif name.startswith("OPT"):
                v.append(R75["rows"][k]["OPT"][0])
            else:
                v.append(c[name]["fresh"][1] if c[name] else np.nan)
        ax.bar(x + (i - 2) * w, v, w, color=col, label=name)
        for j, val in enumerate(v):         # a policy that cannot reach 1% at any risk level
            if np.isnan(val):
                ax.text(x[j] + (i - 2) * w, 2, "x", color=col, ha="center", va="bottom", fontsize=9, weight="bold")
    ax.set_xticks(x, lab, rotation=55, ha="right", fontsize=7)
    ax.set_title(f"s = {s} N a axis, beta ~ N(0, {SB}^2) N a axis")
    ax.grid(alpha=0.3, axis="y")
axes[0].set_ylabel("mean re-zeros per 100 sheets, 1% wall risk")
axes[0].text(0.01, 0.97, "red x: NAIVE-CAL cannot reach 1% at any risk level tried (to 1e-5 a sheet)", transform=axes[0].transAxes, fontsize=7, va="top", color="C3")
axes[1].legend(fontsize=7, loc="upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)

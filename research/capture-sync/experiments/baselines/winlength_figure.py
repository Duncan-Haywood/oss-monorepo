"""Step 4b figure: summed failure share over the ten noise types at -10 dB (noise independent per device) against
window length, for GCC (plain gamma 0.25, envelope-normalised `fn`) and step 4a's five literature baselines;
left the 200 ms room, right the 800 ms room. Log y, since `fn` falls by an order of magnitude.

    python experiments/baselines/winlength_figure.py   # reads winlength_summary.json, writes winlength_sum10.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "winlength_summary.json")))
LENGTHS = ["2.0", "4.0", "8.0"]
METHODS = [("plain", "GCC gamma 0.25", "#999999"), ("fn", "GCC, envelope-normalised", "#55a868"),
           ("kflat", "flatness xcorr (Kammerl-style)", "#4c72b0"), ("kenergy", "energy xcorr", "#8172b2"),
           ("kzcr", "ZCR xcorr", "#ccb974"), ("wang", "landmarks (Wang)", "#c44e52"),
           ("hk", "Haitsma-Kalker bits", "#dd8452")]

fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), sharey=True)
for ax, rt in zip(axes, ("0.2", "0.8")):
    for i, (k, lab, c) in enumerate(METHODS):
        y = [max(S[L]["sum10"][f"{rt}|-10.0"][i], 0.005) for L in LENGTHS]
        ax.plot([float(L) for L in LENGTHS], y, "o-", color=c, label=lab, lw=2 if k == "fn" else 1.3)
    ax.set_xscale("log", base=2)
    ax.set_yscale("log")
    ax.set_xticks([2, 4, 8], ["2 s", "4 s", "8 s"])
    ax.set_xlabel("window length")
    ax.set_title(f"RT60 {float(rt):.1f} s room, ten noise types at -10 dB", fontsize=9)
    ax.grid(alpha=0.3, which="both")
axes[0].set_ylabel("sum of ten failure shares (10 = every window off)")
axes[0].legend(fontsize=7, frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "winlength_sum10.png"), dpi=130)
print("wrote winlength_sum10.png")

"""Figure for step 1: share of windows more than one frame off against the weighting exponent gamma,
per room and noise level, for 1 s and 2 s windows, from summary.json.

    python experiments/real-devices/figure.py
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "summary.json")))["fail"]
GAMMAS = [1.0, 0.75, 0.5, 0.25, 0.0]
NOISE = [("99.0", "as recorded", ":"), ("0.0", "0 dB white", "--"), ("-10.0", "-10 dB white", "-")]
ROOMS = [("200", "#2b6cb0", "200 ms room"), ("800", "#c05621", "800 ms room")]

fig, axes = plt.subplots(1, 2, figsize=(9, 3.6), sharey=True)
for ax, L in zip(axes, ["1.0", "2.0"]):
    for room, col, rname in ROOMS:
        for snr, nname, ls in NOISE:
            ys, lo, hi = [], [], []
            for g in GAMMAS:
                c = S[f"{room}|{snr}|{L}|{g}"]
                ys.append(c["fail"])
                lo.append(c["lo"])
                hi.append(c["hi"])
            ax.plot(GAMMAS, ys, ls, color=col, marker="o", ms=3, label=f"{rname}, {nname}")
            if snr == "-10.0":
                ax.fill_between(GAMMAS, lo, hi, color=col, alpha=0.15, lw=0)
    ax.set_title(f"{float(L):.0f} s windows")
    ax.set_xlabel("weighting exponent gamma (1 = PHAT, 0 = plain correlation)")
    ax.invert_xaxis()
    ax.grid(alpha=0.3)
axes[0].set_ylabel("share of windows > 1 frame off")
axes[1].legend(fontsize=7, loc="upper left")
fig.suptitle("Audio sync of 5 real phones (LibriWASN): failure share by weighting, room and noise", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "failure_by_gamma.png"), dpi=130)
print("wrote failure_by_gamma.png")

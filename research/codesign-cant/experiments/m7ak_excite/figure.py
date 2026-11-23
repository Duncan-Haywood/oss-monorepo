"""Milestone 7ak figure: deaths of 640 per excitation arm and set, against the describing function's count (results.json)."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "stats.json")))["counts"]
ARMS = ["full", "full-O", "full-M", "full-W", "full-G", "full-S", "full-Y", "quiet", "quiet+O", "quiet+M", "quiet+W", "quiet+G", "quiet+S", "quiet+Y"]
DF = {"bolted": 4, "1.25x": 285, "retrained": 2}
TITLE = {"bolted": "bolted-on, 20° limit", "1.25x": "1.25× ceiling, 45° limit", "retrained": "on-ceiling (retrained), 45° limit"}
fig, axs = plt.subplots(1, 3, figsize=(13, 4.2), sharey=False)
for ax, s in zip(axs, DF):
    v = [S[s][a] for a in ARMS]
    col = ["#4c72b0" if a.startswith("full") else "#dd8452" for a in ARMS]
    ax.bar(range(len(ARMS)), v, color=col)
    ax.axhline(DF[s], color="k", ls="--", lw=1, label=f"describing function ({DF[s]})")
    ax.set_xticks(range(len(ARMS))); ax.set_xticklabels(ARMS, rotation=70, fontsize=8)
    ax.set_title(TITLE[s], fontsize=10); ax.legend(fontsize=8, loc="upper right")
axs[0].set_ylabel("flights diverged of 640 (18 s)")
fig.suptitle("Which disturbance kills the flights the describing function says survive (O offset, M mean wind, W wind step, G turbulence, S sensor noise, Y yaw steps)", fontsize=9)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7ak_excite.png"), dpi=110)

"""Figure for milestone 7 from results.json:  python experiments/m7_cost/figure.py"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
NAME = {"hand": ("hand crew", "0.4"), "h1": ("walking H1", "C3"), "base": ("G1 on drive-and-lift base", "C0"),
        "gantry": ("gantry in a plant", "C2")}
fig, ax = plt.subplots(1, 2, figsize=(12, 4.2))

vols = sorted({a["volume"] for a in r["A"]})
h = r["hand"]
ax[0].axhspan(h["p5"], h["p95"], color="0.85", alpha=0.6)
ax[0].axhline(h["median"], color="0.4", lw=1.5, label="hand crew (median, 5-95% band)")
for cls in ("h1", "base", "gantry"):
    rows = sorted((a for a in r["A"] if a["class"] == cls), key=lambda a: a["volume"])
    med = [a["median"] for a in rows]
    lo = [a["p5"] for a in rows]
    hi = [a["p95"] for a in rows]
    ax[0].plot(vols, med, "o-", color=NAME[cls][1], label=NAME[cls][0])
    ax[0].fill_between(vols, lo, hi, color=NAME[cls][1], alpha=0.12)
ax[0].set(xscale="log", yscale="log", xlabel="houses a year (32 wall sheets each)", ylabel="$ per clean sheet",
          title="A. Cost of a clean sheet, best pipeline per draw")
ax[0].legend(fontsize=8)

share = r["cheapest"]
x = np.arange(len(vols))
bottom = np.zeros(len(vols))
for cls in ("hand", "h1", "base", "gantry"):
    v = np.array([share[str(vv)][cls] for vv in vols])
    ax[1].bar(x, v, 0.6, bottom=bottom, color=NAME[cls][1], label=NAME[cls][0])
    bottom += v
ax[1].set_xticks(x)
ax[1].set_xticklabels([str(v) for v in vols])
ax[1].set(xlabel="houses a year", ylabel="share of 4,000 draws", ylim=(0, 1),
          title="B. Which way is cheapest")
ax[1].legend(fontsize=8, loc="lower left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)

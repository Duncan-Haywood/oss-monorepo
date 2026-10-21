"""Draw ratio.png: best in-tolerance table design's energy over int8 MAC's, against the size-law exponent."""
import json
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

H = os.path.dirname(__file__)
t = json.load(open(os.path.join(H, "results.json")))["table"]
al = t["alphas"]
fig, ax = plt.subplots(figsize=(6.5, 4))
for sp, c in ((0.0, "#1b6ca8"), (0.75, "#c0392b")):
    cells = [x for x in t["cells"] if x["sparsity"] == sp]
    mac = [x for x in cells if x["design"] == "int8"][0]
    ok = [x for x in cells if x["design"] != "int8" and x["drop"] <= t["tol"]]
    ax.plot(al, [min(x["nJ"][str(a)] for x in ok) / mac["nJ"][str(a)] for a in al], "o-", c=c, label="sparsity %d%%" % int(sp * 100))
ax.axhline(1, c="k", lw=.8)
ax.axvline(0.5, c="gray", ls=":", lw=.8)
ax.text(0.495, ax.get_ylim()[1] * .95, "Fig. 1.1.9 slope, 8 to 32 KB", rotation=90, va="top", ha="right", fontsize=7)
ax.set_xlabel("array read energy ~ size^alpha (alpha 0: flat 0.156 pJ/bit)")
ax.set_ylabel("table energy / int8 MAC energy (<1: table wins)")
ax.set_title("accel-lutsize: cheapest in-tolerance weight-shared table vs int8 MAC", fontsize=9)
ax.grid(alpha=.3); ax.legend(fontsize=8); fig.tight_layout(); fig.savefig(os.path.join(H, "ratio.png"), dpi=130)

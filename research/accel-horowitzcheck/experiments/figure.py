"""Draw energy.png: accel-kws accuracy against energy per inference, as built and with size-aware array reads."""
import json
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

H = os.path.dirname(__file__)
r = json.load(open(os.path.join(H, "results.json")))
fig, ax = plt.subplots(figsize=(7, 4))
for m, c, mk in (("as_built", "#1b6ca8", "o"), ("paper", "#c0392b", "x")):
    ax.scatter([d[m] for d in r["designs"]], [d["acc"] for d in r["designs"]], s=18, c=c, marker=mk,
               label={"as_built": "as built (0.16 pJ/bit everywhere)", "paper": "array-size law through Fig. 1.1.9"}[m])
ax.set_xscale("log")
ax.set_xlabel("modelled energy per inference (nJ, 45 nm, no leakage)")
ax.set_ylabel("test accuracy (accel-kws, 40 designs)")
ax.set_title("accel-horowitzcheck: same 40 designs, two read-energy models", fontsize=9)
ax.grid(alpha=.3); ax.legend(fontsize=8); fig.tight_layout(); fig.savefig(os.path.join(H, "energy.png"), dpi=130)

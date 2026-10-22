"""Draw the gap intervals against block length from results.json."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(__file__)
d = json.load(open(os.path.join(HERE, "results.json")))["gaps"]
fig, ax = plt.subplots(figsize=(6.4, 3.8))
for i, (name, g) in enumerate(d.items()):
    bs = [int(b) for b in g]
    x = [b * (1 + 0.04 * (i - 1)) for b in bs]
    mid = [g[str(b)]["gap"] for b in bs]
    ax.errorbar(x, mid, yerr=[[g[str(b)]["gap"] - g[str(b)]["lo"] for b in bs],
                              [g[str(b)]["hi"] - g[str(b)]["gap"] for b in bs]],
                fmt="o-", capsize=3, label="vs " + name)
ax.axhline(0, color="k", lw=0.8)
ax.set_xscale("log"); ax.set_xlabel("bootstrap block length (samples of 4 s)")
ax.set_ylabel("RMSE(other) - RMSE(overflow twin), V")
ax.set_title("Overflow twin advantage, 95% block-bootstrap interval", fontsize=10)
ax.legend(fontsize=8); fig.tight_layout()
fig.savefig(os.path.join(HERE, "gap_ci.png"), dpi=130)

"""Redraw figure.png (makespan vs number of printers, with lower bound) from the committed results.json only."""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); r = json.load(open(os.path.join(here, "results.json")))
rows = r["E1"]; n = [x["n_printers"] for x in rows]
fig, ax = plt.subplots(figsize=(6.4, 4))
ax.errorbar(n, [x["makespan"] for x in rows], yerr=[x["half_width"] for x in rows], fmt="o-", capsize=3, label="simulated makespan (CI half-width)")
ax.plot(n, [x["lower_bound"] for x in rows], "s--", label="lower bound")
ax.set_xlabel("printers"); ax.set_ylabel("makespan (min)")
ax.set_title("E1: makespan vs printer count", fontsize=9); ax.legend(fontsize=7); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(here, "makespan.png"), dpi=130)

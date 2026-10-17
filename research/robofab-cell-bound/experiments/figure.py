"""Draw throughput.png (good parts/h vs printer count: bound and simulation) from the committed results.json only.

    python experiments/figure.py
"""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); rows = json.load(open(os.path.join(here, "results.json")))["sweep"]
n = [r["printers"] for r in rows]
fig, ax = plt.subplots(figsize=(6.4, 4))
ax.plot(n, [r["bound_per_h"] for r in rows], "s--", label="bound (min of printer and arm limits)")
for key, lab in (("cv0", "simulated, cv 0"), ("cv03", "simulated, cv 0.3")):
    ax.errorbar(n, [r[key]["good_per_hour"][0] for r in rows], yerr=[r[key]["good_per_hour"][1] for r in rows], fmt="o-", capsize=3, label=lab + " (s.e.)")
ax.set_xlabel("printers"); ax.set_ylabel("good parts per hour")
ax.set_title("robofab-cell-bound: throughput vs printer count", fontsize=9); ax.legend(fontsize=7); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(here, "throughput.png"), dpi=130)
print("wrote", os.path.join(here, "throughput.png"))

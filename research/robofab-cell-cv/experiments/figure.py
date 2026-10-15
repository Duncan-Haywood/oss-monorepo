"""Redraw figure.png (simulated throughput vs service-time variability, with MVA and bound) from the committed results.json only."""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); r = json.load(open(os.path.join(here, "results.json")))
fig, ax = plt.subplots(figsize=(6.4, 4))
for P in sorted({x["P"] for x in r["cv"]}):
    rows = [x for x in r["cv"] if x["P"] == P]; cv = [x["cv"] for x in rows]
    ax.errorbar(cv, [x["sim"][0] for x in rows], yerr=[x["sim"][1] for x in rows], fmt="o-", ms=3, capsize=2, label=f"P={P} sim")
    c = ax.lines[-1].get_color()
    ax.axhline(rows[0]["mva"], color=c, ls="--", lw=.8); ax.axhline(rows[0]["bound"], color=c, ls=":", lw=.8)
ax.set_xlabel("service-time coefficient of variation"); ax.set_ylabel("good parts per hour")
ax.set_title("Simulated throughput vs variability (dashed = MVA, dotted = bound)", fontsize=9); ax.legend(fontsize=7); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(here, "cv_sweep.png"), dpi=130)

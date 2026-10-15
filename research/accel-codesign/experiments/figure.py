"""Redraw figure.png (val accuracy vs area at each deadline) from the committed results.json only."""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); r = json.load(open(os.path.join(here, "results.json")))
fig, ax = plt.subplots(figsize=(6.4, 4))
for row in r["rows"]:
    D = row["deadline"]; f = sorted(r["fronts"][str(D)], key=lambda t: t[5])
    ax.plot([t[5] for t in f], [t[4] for t in f], marker="o", ms=3, label=f"{D} cycles")
    s = row["seq"]; ax.scatter([s["area"]], [s["val"]], marker="*", s=90, color=ax.lines[-1].get_color(), edgecolor="k", zorder=5)
ax.set_xlabel("engine area (Yosys generic cells)"); ax.set_ylabel("validation accuracy")
ax.set_title("Pareto fronts per latency deadline; star = model-first pick", fontsize=9); ax.legend(fontsize=7); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(here, "front.png"), dpi=130)

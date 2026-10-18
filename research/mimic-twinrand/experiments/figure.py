"""Regret against randomization width, one line per nominal twin. Reads results.json, writes regret_vs_width.svg."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
rows = json.loads((HERE / "results.json").read_text())
fig, ax = plt.subplots(figsize=(6.4, 4))
for name in dict.fromkeys(r["nominal"] for r in rows):
    rs = [r for r in rows if r["nominal"] == name]
    ax.plot([r["width"] for r in rs], [r["regret"] for r in rs], marker="o", label=name)
ax.set_xlabel("randomization width (x real parameter value)")
ax.set_ylabel("mean real-system regret (24 seeds)")
ax.set_title("Tuning on a spread of twins vs one twin (stylised pendulum)")
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(HERE / "regret_vs_width.svg")

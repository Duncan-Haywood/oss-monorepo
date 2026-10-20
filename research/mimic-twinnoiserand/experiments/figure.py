"""Regret against width, noise-only (solid) vs all-four (dashed), one colour per nominal twin. Reads results.json."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
rows = json.loads((HERE / "results.json").read_text())
fig, ax = plt.subplots(figsize=(6.8, 4.2))
for c, name in enumerate(dict.fromkeys(r["nominal"] for r in rows)):
    for scheme, ls in (("noise only", "-"), ("all four", "--")):
        rs = [r for r in rows if r["nominal"] == name and r["scheme"] == scheme]
        ax.plot([r["width"] for r in rs], [r["regret"] for r in rs], ls, marker="o", color=f"C{c}",
                label=name if scheme == "noise only" else None)
ax.set_xlabel("randomization width (x real value for sd = 0.02 units)")
ax.set_ylabel("mean real-system regret (24 seeds)")
ax.set_title("Noise-only (solid) vs all-four (dashed) randomization")
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(HERE / "regret_vs_width.svg")

"""Plot per-stage memory and LLM/ASR latency from the committed results.json.

Reads only experiments/results.json; writes memory.png. Usage: python experiments/figure.py
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).parent
d = json.loads((here / "results.json").read_text())
stages = [(m["stage"], m.get("rss_delta_mb", m.get("rss_mb"))) for m in d["mem"]]
fig, ax = plt.subplots(figsize=(7, 3.6))
ax.barh(range(len(stages)), [v for _, v in stages], color="#59a14f")
ax.set_yticks(range(len(stages)))
ax.set_yticklabels([s for s, _ in stages], fontsize=8)
ax.invert_yaxis()
for i, (_, v) in enumerate(stages):
    ax.text(v, i, f" {v:g}", va="center", fontsize=8)
ax.set_xlabel("resident memory added after loading (MB)")
ax.set_title(f"ambient-pipeline: stage memory (peak RSS with all loaded {d['peak_rss_mb']:g} MB)", fontsize=9)
ax.grid(axis="x", alpha=0.3)
fig.tight_layout()
fig.savefig(here / "memory.png", dpi=130)
print("stages", len(stages))

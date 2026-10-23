"""Figure: fastest feasible step against the planned CoP offset, per payload."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
o = json.loads((HERE / "results.json").read_text())
fig, axs = plt.subplots(1, 2, figsize=(9, 3.6), sharey=True)
for ax, (n, ms) in zip(axs, o["payloads"].items()):
    for m in ms:
        ys = []
        for c in o["CS"]:
            ok = [r for r in o["rows"] if r["robot"] == n and r["mass"] == m and r["c"] == c and r["ok"]]
            ys.append(max((r["L"] / r["T"] for r in ok), default=0.0))
        ax.plot([c * 100 for c in o["CS"]], ys, "o-", label=f"{m} kg")
    ax.set_title(n.upper()); ax.set_xlabel("planned CoP offset from sole point (cm)"); ax.legend(fontsize=7)
axs[0].set_ylabel("fastest feasible step (m/s; 0 = none)")
fig.tight_layout(); fig.savefig(HERE / "figure.png", dpi=110)

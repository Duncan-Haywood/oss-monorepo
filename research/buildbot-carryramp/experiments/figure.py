"""Figure: fastest feasible step per payload for each heel-to-toe CoP sweep."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
o = json.loads((HERE / "results.json").read_text())
fig, axs = plt.subplots(1, 2, figsize=(10, 3.8), sharey=True)
for ax, (n, ms) in zip(axs, o["payloads"].items()):
    w = 0.8 / len(ms)
    for i, m in enumerate(ms):
        ys = []
        for r in o["RAMPS"]:
            ok = [x for x in o["rows"] if x["robot"] == n and x["mass"] == m and x["ramp"] == list(r) and x["ok"]]
            ys.append(max((x["L"] / x["T"] for x in ok), default=0.0))
        ax.bar([k + i * w for k in range(len(ys))], ys, w, label=f"{m} kg")
    ax.set_xticks([k + 0.4 - w / 2 for k in range(len(o["RAMPS"]))])
    ax.set_xticklabels([f"{r[0]*100:.0f}>{r[1]*100:.0f}" for r in o["RAMPS"]], fontsize=7)
    ax.set_title(n.upper()); ax.set_xlabel("CoP sweep c0>c1 (cm from sole point)"); ax.legend(fontsize=7)
axs[0].set_ylabel("fastest feasible step (m/s; 0 = none)")
fig.tight_layout(); fig.savefig(HERE / "figure.png", dpi=110)

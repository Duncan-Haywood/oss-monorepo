"""Feasible (step length, step time) cells of the single-support carry for the G1 and H1, from results.json."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
d = json.loads((HERE / "results.json").read_text())
LS, TS, rows = d["LS"], d["TS"], d["rows"]
panels = [("g1", 0.0), ("g1", 3.0), ("h1", 0.0), ("h1", 10.0)]
fig, axs = plt.subplots(1, 4, figsize=(13, 3.4), sharey=True)
for ax, (name, m) in zip(axs, panels):
    for r in rows:
        if r["robot"] == name and r["mass"] == m and r["slope"] == 0 and r["rise"] == 0:
            ax.scatter(LS.index(r["L"]), TS.index(r["T"]), s=380, marker="s",
                       color="#2a9d8f" if r["ok"] else "#d9d9d9", edgecolor="#555")
            if not r["ok"]:
                ax.text(LS.index(r["L"]), TS.index(r["T"]), f"{r['ratio']:.1f}" if r["ratio"] < 10 else ">10", ha="center", va="center", fontsize=6)
    ax.set_xticks(range(len(LS)), [str(x) for x in LS])
    ax.set_title(f"{name.upper()} carrying {m:.0f} kg")
    ax.set_xlabel("step length (m)")
axs[0].set_yticks(range(len(TS)), [str(t) for t in TS])
axs[0].set_ylabel("single-support time (s)")
fig.suptitle("Green: torque, centre of pressure and reach all inside limits. Grey: fails (number = peak torque / limit)", fontsize=9)
fig.tight_layout()
fig.savefig(HERE / "figure.png", dpi=110)

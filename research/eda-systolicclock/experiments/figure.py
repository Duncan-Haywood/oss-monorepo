"""area x cycles at the 10 ns target for each design (WB=4,6,8; bars missing = misses 10 ns). Reads swept.json; writes tradeoff.png.
Run: python figure.py (needs matplotlib)"""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

D = Path(__file__).resolve().parent
rows = [r for r in json.load(open(D / "swept.json"))["rows"] if r["period"] == 10000]
fig, axs = plt.subplots(1, 3, figsize=(11, 3.6), sharey=True)
for ax, wb in zip(axs, (4, 6, 8)):
    for k, (kind, col) in enumerate((("lane", "#1f77b4"), ("systolic", "#d95f02"))):
        for j, c in enumerate((1, 2, 4, 8)):
            r = next(x for x in rows if x["wb"] == wb and x["kind"] == kind and x["c"] == c)
            ok = r["delay_ps"] <= 10000
            ax.bar(j + 0.4 * k - 0.2, r["area_um2"] * r["cycles"] / 1e6 if ok else 0, 0.38, color=col, label=kind if j == 0 else None)
    ax.set_xticks(range(4)); ax.set_xticklabels(["1", "2", "4", "8"]); ax.set_xlabel("lanes P / array columns C"); ax.set_title(f"WB={wb}")
axs[0].set_ylabel("area x cycles (10^6 um2 cycles)"); axs[0].legend()
fig.suptitle("SKY130 HD at a shared 10 ns target: MAC lanes vs 4xC systolic array (4-vector batch; 0 = misses 10 ns)")
fig.tight_layout(); fig.savefig(D / "tradeoff.png", dpi=110)

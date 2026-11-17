"""Figure for milestone 5: held-out J in RotorPy against the stylised simulator for the 60 milestone-4 designs (left, one colour per
RotorPy condition; filled = canted), and the paired cant advantage per attitude law in each simulator (right). Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "results.json")))
ds = d["designs"]
CONDS = ["torque", "aero", "aero_cop", "aero_cop2"]
COL = {"stylised": "#555555", "torque": "#1f77b4", "aero": "#2ca02c", "aero_cop": "#ff7f0e", "aero_cop2": "#d62728"}
fig, ax = plt.subplots(1, 2, figsize=(12, 4.6))
for m in CONDS:
    for cap, mk in ((80, "o"), (0, "s")):
        sel = [r for r in ds if r["cap"] == cap]
        ax[0].scatter([r["stylised"]["J"] for r in sel], [r[m]["J"] for r in sel], s=16, marker=mk, color=COL[m],
                      facecolors=COL[m] if cap == 80 else "none", alpha=0.7, label=f"{m}" if cap == 80 else None)
lo = min(min(r[m]["J"] for r in ds) for m in ["stylised"] + CONDS) - 0.5
hi = max(max(r[m]["J"] for r in ds) for m in ["stylised"] + CONDS) + 0.5
ax[0].plot([lo, hi], [lo, hi], "k-", lw=0.6)
ax[0].set_xlabel("J in the stylised simulator (−RMS° − 0.3 P/100 W)"); ax[0].set_ylabel("J of the same design in RotorPy")
ax[0].set_title("Same designs, two simulators (filled: canted, open: no cant)"); ax[0].legend(frameon=False, fontsize=8)
laws = ("pid", "indi", "geo")
for k, m in enumerate(["stylised"] + CONDS):
    for j, c in enumerate(laws):
        a = {r["seed"]: r[m]["rms"] for r in ds if r["ctrl"] == c and r["cap"] == 80}
        b = {r["seed"]: r[m]["rms"] for r in ds if r["ctrl"] == c and r["cap"] == 0}
        dd = np.array([a[s] - b[s] for s in sorted(a) if s in b])
        x = j + (k - 2) * 0.15
        ax[1].scatter(np.full(len(dd), x), dd, s=10, color=COL[m], alpha=0.5)
        ax[1].hlines(dd.mean(), x - 0.06, x + 0.06, color=COL[m], lw=2, label=m if j == 0 else None)
ax[1].axhline(0, color="k", lw=0.6); ax[1].set_xticks(range(3)); ax[1].set_xticklabels(["PID", "INDI", "geometric"])
ax[1].set_ylabel("held-out RMS, cant minus no cant (deg; below 0: cant better)"); ax[1].set_title("Cant advantage, paired by seed")
ax[1].legend(frameon=False, fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m5_rotorpy.png"), dpi=150)
print("wrote m5_rotorpy.png")

"""Figure for milestone 4: held-out RMS by attitude law and cant (left), paired cant advantage by law (right). Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "results.json")))
runs = d["runs"]
CTRLS = ("pid", "indi", "geo")
NAMES = {"pid": "PID", "indi": "INDI", "geo": "Geometric SO(3)"}
COL = {0: "#7f7f7f", 80: "#1f77b4"}


def sel(c, cap, key):
    return np.array([r[key] for r in sorted((r for r in runs if r["ctrl"] == c and r["cap"] == cap), key=lambda r: r["seed"])])


fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4))
rng = np.random.default_rng(0)
for i, c in enumerate(CTRLS):
    for j, cap in enumerate((0, 80)):
        y = sel(c, cap, "rms"); x = i + (j - 0.5) * 0.3
        a1.scatter(x + rng.uniform(-0.05, 0.05, len(y)), y, s=14, color=COL[cap], alpha=0.75, label=("no cant" if cap == 0 else "cant ≤ 80°") if i == 0 else None)
        a1.hlines(y.mean(), x - 0.1, x + 0.1, color="k", lw=1.5)
a1.set_xticks(range(3)); a1.set_xticklabels([NAMES[c] for c in CTRLS])
a1.set_ylabel("held-out RMS attitude error (deg)"); a1.legend(frameon=False); a1.set_title("Co-designed vehicles, 10 seeds per arm")
for i, c in enumerate(CTRLS):
    for k, (key, off, mk) in enumerate((("rms", -0.12, "o"), ("rms_gust8", 0.12, "s"))):
        dlt = sel(c, 80, key) - sel(c, 0, key)
        a2.scatter(i + off + rng.uniform(-0.04, 0.04, len(dlt)), dlt, s=14, marker=mk, color="#d62728" if k else "#1f77b4", alpha=0.75,
                   label=("design gusts" if k == 0 else "2× gust intensity") if i == 0 else None)
        a2.hlines(dlt.mean(), i + off - 0.08, i + off + 0.08, color="k", lw=1.5)
a2.axhline(0, color="k", lw=0.6)
a2.set_xticks(range(3)); a2.set_xticklabels([NAMES[c] for c in CTRLS])
a2.set_ylabel("cant minus no cant, paired by seed (deg)"); a2.legend(frameon=False); a2.set_title("Cant advantage by attitude law (below 0: cant better)")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m4_controllers.png"), dpi=150)
print("wrote m4_controllers.png")

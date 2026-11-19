"""Figure for milestone 60: python experiments/m60_jointpreload/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC = D["spec_mm"]
AX = ("y", "z", "yd", "zd")
esc = [(x["robot"], r["esc"]) for x in D["runs"] for r in x["rows"] if "esc" in r]
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4), gridspec_kw={"width_ratios": [1.1, 1.6]})
lad = D["ladder"]
for i, (name, key, c) in enumerate((("targeted (binding joint)", "Mt", "C1"), ("uniform (every leg joint)", "Mu", "C2"))):
    counts = [sum(1 for _, e in esc if e[key] is not None and abs(e[key] - m) < 1e-9) for m in lad]
    counts.append(sum(1 for _, e in esc if e[key] is None))
    xs = np.arange(len(lad) + 1)
    ax1.bar(xs - 0.2 + 0.4 * i, counts, 0.38, color=c, label=name)
ax1.set_xticks(np.arange(len(lad) + 1), [f"{m:g}" for m in lad] + ["none"], fontsize=8)
ax1.set_xlabel("smallest leg preload margin that plans the case (N m)")
ax1.set_ylabel("cases the four-row bound left unplanned")
ax1.set_title(f"Held-out seed {D['seed']}: {len(esc)} unplanned cases", fontsize=10)
ax1.legend(fontsize=7)
us = [e["u"] for _, e in esc if e["u"] is not None]
if us:
    data = [[o[a] for o in us] for a in AX]
    ax2.boxplot(data, showfliers=True)
    for k, v in enumerate(data):
        ax2.scatter(np.full(len(v), k + 1) + np.random.default_rng(k).uniform(-0.12, 0.12, len(v)), v, s=8,
                    color="C2", alpha=0.6)
ax2.axhline(SPEC, color="k", lw=0.8, ls=":", label=f"spec {SPEC} mm")
ax2.set_xticks(range(1, 5), ["nose y", "nose z", "depth y", "depth z"], fontsize=8)
ax2.set_ylabel("residual of the escalated plan (mm)")
ax2.set_title("Residuals with the uniform raise", fontsize=10)
ax2.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")

"""Milestone 7ag figure. Left: each design's simulated median rise time (full simulator, 36 ms law, 64 episodes, b = 0.25 m)
against the point-mass prediction, for every (A_P, S) condition, with the y = x line and the +-0.10 s band. Right: the residual
(simulator - prediction) for the point mass and for 7af's line, per condition. Writes m7ag_cruise.png."""
import os, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import verdicts as V  # noqa: E402

T = {tuple(c): V.table(*c) for c in V.R["conds"]}
fig, (ax, bx) = plt.subplots(1, 2, figsize=(11, 4.6))
cm = plt.get_cmap("viridis")
for i, ((a, s), t) in enumerate(T.items()):
    col = cm(i / (len(T) - 1))
    ax.scatter(t["pm"], t["sim"], s=14, color=col, label=f"A_P {a:g} m/s², S {s:g} m", alpha=0.85)
    for j, (f, mk) in enumerate((("pm", "o"), ("ln", "x"))):
        r = t["sim"] - t[f]
        bx.scatter(np.full(len(r), i + (j - 0.5) * 0.3) + np.random.default_rng(i).uniform(-0.06, 0.06, len(r)), r, s=12,
                   marker=mk, color=col, alpha=0.8)
lo, hi = 0.6, 4.8
ax.plot([lo, hi], [lo, hi], "k-", lw=0.8); ax.fill_between([lo, hi], [lo - 0.1, hi - 0.1], [lo + 0.1, hi + 0.1], color="0.85", zorder=0)
ax.set_xlim(lo, hi); ax.set_ylim(lo, hi)
ax.set_xlabel("point-mass prediction of rise to 90% (s)"); ax.set_ylabel("simulated median rise (s)")
ax.set_title("36 designs, 7 conditions, 36 ms law, b = 0.25 m"); ax.legend(fontsize=7, loc="upper left")
bx.axhline(0, color="k", lw=0.8); bx.axhspan(-0.1, 0.1, color="0.9", zorder=0)
bx.set_xticks(range(len(T))); bx.set_xticklabels([f"{a:g}\n{s:g}" for a, s in T], fontsize=8)
bx.set_xlabel("A_P (m/s²) / step S (m)"); bx.set_ylabel("simulator − prediction (s)")
bx.set_title("o point mass (no fitted constant), x 7af's line")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7ag_cruise.png"), dpi=130)

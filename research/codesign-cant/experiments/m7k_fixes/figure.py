"""Milestone 7k figure from results.json: crashes at a 45-deg limit per fix (left, log scale) against the cost at the trained condition (right)."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
R, F = D["runs"], list(D["fixes"])


def cell(cap, lever, offset, fix):
    rows = [o for o in R if (o["cap"], o["lever"], o["offset"], o["fix"]) == (cap, lever, offset, fix)]
    base = [o for o in R if (o["cap"], o["lever"], o["offset"], o["fix"]) == (cap, lever, offset, "base")]
    dead = sum(sum(o["dead"]) for o in rows)
    dc = np.concatenate([np.asarray(o["C"]) - np.asarray(b["C"]) for o, b in zip(rows, base)])
    return dead, dc.mean()


fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.2))
x = np.arange(len(F)); w = 0.38
for k, (off, col, lab) in enumerate(((0.5, "#3b6ea8", "start offset ±0.5 m (as trained)"), (1.0, "#c0603a", "start offset ±1.0 m"))):
    dead = [cell(45.0, 1.0, off, f)[0] for f in F]
    a.bar(x + (k - 0.5) * w, np.maximum(dead, 0.6), w, color=col, label=lab)
    for xi, d in zip(x, dead):
        a.text(xi + (k - 0.5) * w, max(d, 0.6) * 1.15, str(d), ha="center", fontsize=7)
a.set_yscale("log"); a.set_ylim(0.5, 6000); a.set_xticks(x); a.set_xticklabels(F, rotation=45, ha="right", fontsize=8)
a.set_ylabel("diverged flights of 3072 (48 designs × 64)"); a.set_title("45° tilt limit, trained lever: crashes per fix", fontsize=10)
a.legend(fontsize=8, frameon=False)
dc = [cell(20.0, 1.0, 0.5, f)[1] for f in F[1:]]
b.bar(np.arange(len(dc)), dc, 0.6, color=["#3b6ea8" if v < 0.3 else "#999999" for v in dc])
b.set_yscale("symlog", linthresh=0.1); b.set_xticks(np.arange(len(dc))); b.set_xticklabels(F[1:], rotation=45, ha="right", fontsize=8)
b.set_ylabel("mean change in held-out cost C (base ≈ 1.5)"); b.set_title("price at the trained condition (20°, lever 1)", fontsize=10)
for xi, v in enumerate(dc):
    b.text(xi, v * 1.12 if v > 0 else 0.0, f"{v:+.3f}", ha="center", fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7k_fixes.png"), dpi=130)

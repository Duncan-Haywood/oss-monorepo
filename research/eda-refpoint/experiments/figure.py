"""Draw tpe_vs_random.png from the committed results.txt: paired TPE-minus-random difference under each indicator."""
import os
import re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

D = os.path.dirname(os.path.abspath(__file__))
rows = {}
for l in open(os.path.join(D, "results.txt")):
    m = re.match(r"budget\s+(\d+)\s+(.+?)\s+mean diff ([+-][\d.]+)\s+better ([\d.]+)\s+worse ([\d.]+)", l)
    if m:
        rows.setdefault(int(m[1]), []).append((m[2], float(m[4]), float(m[5])))
fig, ax = plt.subplots(figsize=(7, 3.8))
names = [r[0] for r in rows[30]]
for k, b in enumerate((16, 30)):
    ax.bar([i + 0.4 * k for i in range(len(names))], [r[1] - r[2] for r in rows[b]], 0.4, label=f"budget {b}")
ax.set_xticks([i + 0.2 for i in range(len(names))]); ax.set_xticklabels(names, rotation=30, ha="right", fontsize=8)
ax.set_ylabel("share of seeds TPE better minus share worse"); ax.legend(fontsize=8); ax.grid(alpha=.3, axis="y")
ax.set_title("TPE vs random: same 100 runs, eight indicators", fontsize=10)
fig.tight_layout(); fig.savefig(os.path.join(D, "tpe_vs_random.png"), dpi=130)

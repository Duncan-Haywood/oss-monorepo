"""Bar chart of the lowest buckling factor by mesh and load direction, from check.txt."""
import os, re
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
rows = {}
for ln in open(os.path.join(HERE, "check.txt")):
    m = re.match(r"([+-]1) \((\d+), (\d+), (\d+), (\d+)\) ([\d.]+)", ln)
    if m:
        rows.setdefault(m[1], []).append(((m[2], m[3], m[4], m[5]), float(m[6])))
fig, ax = plt.subplots(figsize=(6, 3.6))
labels = [",".join(k) for k, _ in rows["+1"]]
xs = range(len(labels))
ax.bar([x - 0.2 for x in xs], [v for _, v in rows["+1"]], 0.4, label="downward load (arm in tension)")
ax.bar([x + 0.2 for x in xs], [v for _, v in rows["-1"]], 0.4, label="reversed load (arm in compression)")
ax.axhline(3.47, color="k", ls="--", lw=1, label="closed form, moment only (3.47)")
ax.axhline(3.0, color="r", ls=":", lw=1, label="floor of 3")
ax.set_xticks(list(xs)); ax.set_xticklabels(labels); ax.set_xlabel("mesh (nw, nh, nl, nz)")
ax.set_ylabel("lowest buckling factor at 100 N"); ax.legend(fontsize=7); fig.tight_layout()
fig.savefig(os.path.join(HERE, "check.png"), dpi=130)

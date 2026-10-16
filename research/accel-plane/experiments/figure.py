"""RTL cycles and Yosys cells against lanes for the OS and RT engines, from results.json only."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(2, 2, figsize=(8, 5.4), sharex=True)
for c, shape in enumerate(("L1 64x70", "L2 11x64")):
    for design, st in (("OS", "o-"), ("RT", "s--"), ("RTp", "^:")):
        pts = sorted((r["P"], r["rtl_cycles"], r["cells"]) for r in R if r["shape"] == shape and r["design"] == design)
        ax[0][c].plot([p[0] for p in pts], [p[1] for p in pts], st, label=design)
        ax[1][c].plot([p[0] for p in pts], [p[2] for p in pts], st, label=design)
    ax[0][c].set_title(shape + " (outputs x inputs)", fontsize=9)
    ax[0][c].set_yscale("log"); ax[1][c].set_yscale("log")
    ax[1][c].set_xscale("log", base=2); ax[1][c].set_xlabel("MAC lanes P")
ax[0][0].set_ylabel("RTL cycles per product"); ax[1][0].set_ylabel("Yosys generic cells")
ax[0][0].legend(fontsize=8)
fig.suptitle("accel-plane: P-lane RTL engines (Icarus cycles, Yosys cells)", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "plane.png"), dpi=110)

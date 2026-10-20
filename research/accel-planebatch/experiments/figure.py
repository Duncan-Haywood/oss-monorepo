"""Weight fetches and Yosys cells against batch size for OS and WS, from results.json only."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(1, 2, figsize=(8, 3.4))
for design, st in (("OS", "o-"), ("WS", "s--")):
    pts = sorted((r["B"], r["rtl_w_rd"], r["cells"]) for r in R if r["shape"] == "L1 64x70" and r["design"] == design)
    ax[0].plot([p[0] for p in pts], [p[1] for p in pts], st, label=design)
    ax[1].plot([p[0] for p in pts], [p[2] for p in pts], st, label=design)
for a in ax:
    a.set_xscale("log", base=2); a.set_xlabel("batch B")
ax[0].set_yscale("log"); ax[0].set_ylabel("weight fetches per batch (RTL)"); ax[1].set_ylabel("Yosys generic cells")
ax[0].legend(fontsize=8)
fig.suptitle("accel-planebatch: 64x70 layer, P = 8 (Icarus fetch counts, Yosys cells)", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "planebatch.png"), dpi=110)

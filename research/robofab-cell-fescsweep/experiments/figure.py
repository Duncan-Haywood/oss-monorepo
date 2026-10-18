"""Draw error.png (decomposition error against inspection time in units of the knee t*) from results.json only.

    python experiments/figure.py
"""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); cells = json.load(open(os.path.join(here, "results.json")))["cells"]
fig, ax = plt.subplots(figsize=(6.6, 4))
for c in cells:
    ax.plot([t / c["tstar"] for t in c["insp"]], c["err"], marker="o", ms=2.5, lw=1,
            label=f"print {c['print']}, P={c['P']}, N={c['N']}")
ax.axvline(1, color="k", lw=.7, ls=":")
ax.set_xscale("log"); ax.set_xlabel("inspection time / t*  (t* = 1/H(N): inspector alone matches the subsystem's rate)")
ax.set_ylabel("decomposition error vs exact chain (%)")
ax.set_title("robofab-cell-fescsweep: the error lives where inspector and subsystem are matched", fontsize=9)
ax.legend(fontsize=6, ncol=2); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(here, "error.png"), dpi=130)
print("wrote", os.path.join(here, "error.png"))

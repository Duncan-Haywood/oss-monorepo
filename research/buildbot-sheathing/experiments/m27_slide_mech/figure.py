"""Figure for milestone 27: python experiments/m27_slide_mech/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
RATIOS = sorted({r["ratio"] for r in R["E"]["rows"]})

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.4))
for i, q in enumerate(RATIOS):
    d = [c for c in R["D"] if c["ratio"] == q and c["mu_s"] == 0.4 and c["cv"] == 0.1]
    a.plot([c["tau"] * 1e3 for c in d], [c["rms"] * 1e3 for c in d], "o-", color=f"C{i}", label=f"$\\mu_k/\\mu_s$ = {q}")
    e = [c for c in R["E"]["rows"] if c["ratio"] == q]
    b.plot([c["tau"] * 1e3 for c in e], [c["clean"] for c in e], "o-", color=f"C{i}", label=f"$\\mu_k/\\mu_s$ = {q}")
a.axhline(0.5, color="k", ls=":", lw=1)
a.text(2.1, 0.55, "0.5 mm assumed by milestones 10-13", fontsize=8)
a.set(xscale="log", yscale="log", xlabel="reaction time: slip seen to hand released (ms)",
      ylabel="slide residual, rms (mm)", title="Slide residual of a push-only G1 hand ($\\mu_s$ 0.4)")
b.axhline(R["E"]["base"], color="k", ls=":", lw=1)
b.text(2.1, R["E"]["base"] - 0.04, f"milestone 12 with 0.5 mm: {R['E']['base']:.3f}", fontsize=8)
b.set(xscale="log", ylim=(0, 0.9), xlabel="reaction time (ms)", ylabel="clean sheets",
      title="Best single-2x stack on measured studs")
for ax in (a, b):
    ax.grid(alpha=0.3, which="both")
    ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)

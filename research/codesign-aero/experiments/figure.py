"""Grid landscape of tuned-controller RMS roll error over the airframe, and pipeline results -> landscape.png (from results.json)."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
J = np.array(R["grid"], float); J[J <= -90] = np.nan
fig, (a, b) = plt.subplots(1, 2, figsize=(10.5, 4.2), gridspec_kw={"width_ratios": [1, 1.25]})
im = a.imshow(-J.T, origin="lower", extent=[0.08, 0.30, 0.08, 0.25], aspect="auto", cmap="viridis_r")
a.set_xlabel("arm length L (m)"); a.set_ylabel("prop diameter D (m)")
a.set_title("RMS roll error, controller re-tuned per airframe", fontsize=9)
fig.colorbar(im, ax=a, label="deg (grey = infeasible)")
a.plot(R["grid_best"][1], R["grid_best"][2], "r*", ms=12)
names = list(R["pipelines"]); short = [n.split(" (")[0] for n in names]
b.boxplot([R["pipelines"][n] for n in names], vert=False, tick_labels=short)
b.axvline(-R["grid_best"][0], color="r", ls="--", lw=1, label="grid optimum")
b.set_xlabel("held-out RMS roll error (deg), 10 seeds, equal budget"); b.legend(fontsize=8)
b.tick_params(axis="y", labelsize=7); b.invert_yaxis(); b.grid(alpha=0.3)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "landscape.png"), dpi=130)
print("wrote landscape.png")

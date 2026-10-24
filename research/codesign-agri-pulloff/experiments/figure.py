"""results.json -> pulloff.png: median best J at 40 evaluations per method against the median stem pull-off force, for the 8 N and 10 N grip bounds."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
meds = sorted({r["med"] for r in R})
fig, ax = plt.subplots(1, 2, figsize=(10, 4), sharey=True)
for a, f in zip(ax, (8.0, 10.0)):
    for n, c in zip(("random search", "CMA-ES", "Bayesian opt (GP-EI)"), ("#888888", "#d95f02", "#1b7837")):
        a.plot(meds, [np.median([r["J"] for r in R if r["med"] == m and r["fmax"] == f and r["name"] == n and r["budget"] == 40]) for m in meds], "o-", color=c, label=n)
    a.plot(meds, [max(r["J"] for r in R if r["med"] == m and r["fmax"] == f and r["budget"] == 400) for m in meds], "k--", label="reference (400 evaluations)")
    a.set(xlabel="median stem pull-off force (N)", title=f"grip force bound {f:g} N")
ax[0].set_ylabel("best J")
ax[0].legend(frameon=False, fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "pulloff.png"), dpi=110)

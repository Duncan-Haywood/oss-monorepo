"""results.json -> sweep.png: regret per method across worlds, and how the optimum's finger count follows stem strength."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))["worlds"]
M = ["random search", "CMA-ES", "Bayesian opt (GP-EI)"]
fig, ax = plt.subplots(1, 2, figsize=(10, 4))
for m, c in zip(M, ("#888888", "#d95f02", "#1b7837")):
    r = np.sort([w["ref"]["J"] - np.median(w["final"][m]) for w in R])
    ax[0].plot(np.arange(1, len(r) + 1), r, color=c, label=m)
ax[0].set(xlabel="world, sorted by regret within each method", ylabel="regret to reference optimum (J)", title="100 swept worlds, 40 evaluations")
ax[0].legend(frameon=False)
rng = np.random.default_rng(0)
sm = [w["params"]["stem_median"] for w in R]; nf = [w["ref"]["x"][4] + rng.uniform(-.12, .12) for w in R]
ax[1].scatter(sm, nf, s=14, color="#1b7837"); ax[1].set_xscale("log")
ax[1].set(xlabel="median stem pull-off force (N)", ylabel="fingers in the reference optimum", yticks=[2, 3, 4], title="Optimum shape follows stem strength")
fig.tight_layout(); fig.savefig(os.path.join(HERE, "sweep.png"), dpi=110)

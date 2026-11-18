"""Figure for milestone 7f: against the margin's bound on ki (as a fraction of the linear ceiling, 1/M), (left) held-out cost at the
design wind, paired against the unconstrained designs (mean and se over six seeds), and (right) held-out flights that diverged
(of 384) at a 45 deg tilt-command limit and at twice the trained centre-of-pressure lever. Dashed lines: the unconstrained
designs. Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
runs = R["runs"]
by = lambda lab: sorted((r for r in runs if r["label"] == lab), key=lambda r: r["seed"])
base = by("unconstrained")
labs = [l for l in R["margins"] if l != "unconstrained"]
frac = np.array([1.0 / float(l.split("=")[1]) for l in labs])
fig, ax = plt.subplots(1, 2, figsize=(11, 4.3))
for key, col, name in (("20_0", "#1f77b4", "design wind (lever 0)"), ("20_1", "#ff7f0e", "trained lever (lever 1)")):
    d = [[a[f"J_{key}"] - b[f"J_{key}"] for a, b in zip(by(l), base)] for l in labs]
    m = [np.mean(v) for v in d]; se = [np.std(v, ddof=1) / np.sqrt(len(v)) for v in d]
    ax[0].errorbar(frac, m, yerr=se, marker="o", color=col, capsize=3, label=name)
ax[0].axhline(0, color="k", lw=0.8, ls="--", label="unconstrained")
ax[0].set_xlabel("ki bound as a fraction of its linear ceiling (1/M)")
ax[0].set_ylabel("held-out J minus unconstrained (higher is better)")
ax[0].set_title("Price of the margin (20° tilt limit)")
ax[0].invert_xaxis(); ax[0].legend(fontsize=8)
for key, col, mk, name in (("45_0", "#d62728", "s", "45° limit, lever 0"), ("45_1", "#9467bd", "^", "45° limit, lever 1"),
                           ("20_2", "#2ca02c", "o", "20° limit, lever 2"), ("45_2", "#8c564b", "D", "45° limit, lever 2")):
    n = [sum(r[f"dead_{key}"] for r in by(l)) for l in labs]
    ax[1].plot(frac, n, marker=mk, color=col, label=name)
    ax[1].axhline(sum(r[f"dead_{key}"] for r in base), color=col, lw=0.8, ls="--")
ax[1].set_xlabel("ki bound as a fraction of its linear ceiling (1/M)")
ax[1].set_ylabel("held-out flights diverged (of 384)")
ax[1].set_title("Divergence (dashed: unconstrained)")
ax[1].invert_xaxis(); ax[1].legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7f_sweep.png"), dpi=130)
print("wrote m7f_sweep.png")

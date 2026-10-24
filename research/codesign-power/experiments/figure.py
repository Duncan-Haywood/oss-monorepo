"""Dot plot: true success (600 scenes) of each run's final design, by method, with the mean and 95% interval."""
import json, os, sys
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_power import boot_ci
R = json.load(open(os.path.join(HERE, "results.json")))["records"]
methods = list(dict.fromkeys(r["method"] for r in R))
fig, ax = plt.subplots(figsize=(7, 3.8))
rng = np.random.default_rng(0)
for i, m in enumerate(methods):
    v = np.array([r["true"] for r in R if r["method"] == m and r["n"] == 40])
    t = np.array([r["test"] for r in R if r["method"] == m and r["n"] == 40])
    ax.scatter(np.full(len(t), i) - 0.18 + rng.uniform(-.04, .04, len(t)), t, s=14, color="#bbbbbb", label="40-scene test score (selected on)" if i == 0 else None)
    ax.scatter(np.full(len(v), i) + 0.1 + rng.uniform(-.06, .06, len(v)), v, s=16, color="#1f6fb2", label="600-scene success, same designs" if i == 0 else None)
    mu, lo, hi = boot_ci(v)
    ax.errorbar(i + 0.3, mu, yerr=[[mu - lo], [hi - mu]], color="#c0392b", marker="o", capsize=3, label="mean and 95% interval (600 scenes)" if i == 0 else None)
ax.set_xticks(range(len(methods))); ax.set_xticklabels([m.replace("reader ", "").replace(": ", "\n") for m in methods], fontsize=7)
ax.set_ylabel("grasp success"); ax.set_title("Final designs after 40 evaluations, 8 runs per method", fontsize=9)
ax.legend(fontsize=7, loc="lower left"); fig.tight_layout(); fig.savefig(os.path.join(HERE, "best_designs_600_scenes.svg"))

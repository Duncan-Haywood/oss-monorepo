"""Dot plot: 600-scene success of each run's final design, 24 runs per method, with mean and 95% bootstrap interval."""
import json, os, sys
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "codesign-power", "src"))
from codesign_power import boot_ci
R = json.load(open(os.path.join(HERE, "results.json")))["records"]
methods = list(dict.fromkeys(r["method"] for r in R))
fig, ax = plt.subplots(figsize=(7, 3.8))
rng = np.random.default_rng(0)
for i, m in enumerate(methods):
    for src, c, lab in (("headroom", "#999999", "original 8 runs"), ("new", "#1f6fb2", "16 new runs")):
        v = np.array([r["true"] for r in R if r["method"] == m and r["source"] == src])
        ax.scatter(i - 0.12 + rng.uniform(-.1, .1, len(v)), v, s=14, color=c, label=lab if i == 0 else None)
    v = np.array([r["true"] for r in R if r["method"] == m])
    mu, lo, hi = boot_ci(v)
    ax.errorbar(i + 0.25, mu, yerr=[[mu - lo], [hi - mu]], color="#c0392b", marker="o", capsize=3, label="mean and 95% interval (24 runs)" if i == 0 else None)
ax.set_xticks(range(len(methods))); ax.set_xticklabels([m.replace("reader ", "").replace(": ", "\n") for m in methods], fontsize=7)
ax.set_ylabel("true success (600 scenes)"); ax.set_title("Final design of each run after 40 evaluations", fontsize=9)
ax.legend(fontsize=7, loc="lower left"); fig.tight_layout(); fig.savefig(os.path.join(HERE, "final_designs_24_runs.svg"))

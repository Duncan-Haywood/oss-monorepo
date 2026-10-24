"""Draw experiments/figure.svg from results.json: realised FPR spread against calibration sample size k, pooled over families."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
res = json.load(open(os.path.join(HERE, "results.json")))
ks = sorted(int(k) for k in next(iter(res.values())))
fig, ax = plt.subplots(figsize=(7, 3.6))
for name, col in (("plain", "#3b6ea5"), ("conformal", "#2e8b57")):
    g = lambda key: [np.mean([res[f][str(k)][name][key] for f in res]) for k in ks]
    ax.plot(ks, g("fpr_mean"), "o-", color=col, label=f"{name}: mean")
    ax.fill_between(ks, g("fpr_p10"), g("fpr_p90"), color=col, alpha=0.18, label=f"{name}: 10th-90th percentile")
ax.axhline(0.05, color="#c0392b", ls="--", label="nominal 5%")
ax.set_xscale("log")
ax.set_xticks(ks)
ax.set_xticklabels(ks)
ax.set_xlabel("human texts in the calibration sample (k)")
ax.set_ylabel("human texts flagged as machine")
ax.set_title("Re-setting the threshold from k human texts of the new family")
ax.legend(fontsize=7)
fig.tight_layout()
os.makedirs(os.path.join(HERE, "experiments"), exist_ok=True)
fig.savefig(os.path.join(HERE, "experiments", "figure.svg"))

"""Draw experiments/figure.svg from results.json: realised FPR per held-out family against the nominal 5%."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
res = json.load(open(os.path.join(HERE, "results.json")))
fams = list(res)
fpr = [res[f]["fpr"] for f in fams]
err = [[res[f]["fpr"] - res[f]["fpr_ci95"][0] for f in fams], [res[f]["fpr_ci95"][1] - res[f]["fpr"] for f in fams]]
fig, ax = plt.subplots(figsize=(7, 3.6))
ax.bar(fams, fpr, yerr=err, color="#3b6ea5", capsize=3)
ax.axhline(0.05, color="#c0392b", ls="--", label="nominal 5%")
ax.set_ylabel("human texts flagged as machine")
ax.set_title("Threshold set for 5% FPR on 7 families, applied to the 8th")
ax.legend()
fig.tight_layout()
os.makedirs(os.path.join(HERE, "experiments"), exist_ok=True)
fig.savefig(os.path.join(HERE, "experiments", "figure.svg"))

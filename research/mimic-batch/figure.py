"""Draw experiments/figure.svg from results.json: batch AUROC and test-half FPR against batch size k, pooled over families."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
res = json.load(open(os.path.join(HERE, "results.json")))
ks = sorted(int(k) for k in next(iter(res.values())))
fig, (a, b) = plt.subplots(1, 2, figsize=(9, 3.6))
for p, col in (("1.0", "#2e8b57"), ("0.5", "#3b6ea5"), ("0.25", "#d98c1f"), ("0.1", "#8e44ad")):
    kk = [k for k in ks if all(p in res[f][str(k)] for f in res)]
    a.plot(kk, [np.mean([res[f][str(k)][p]["auroc"] for f in res]) for k in kk], "o-", color=col, label=f"{int(float(p) * 100)}% of batch is machine")
a.set_xscale("log"); a.set_xticks(ks); a.set_xticklabels(ks)
a.set_xlabel("texts in the batch (k)"); a.set_ylabel("AUROC of the batch mean score"); a.set_title("Batch verdict gets sharper with k", fontsize=9)
a.legend(fontsize=7)
for f in res:
    b.plot(ks, [res[f][str(k)]["fpr"] for k in ks], "-", color="#999", alpha=0.7)
    b.annotate(f, (ks[-1], res[f][str(ks[-1])]["fpr"]), fontsize=6, xytext=(3, 0), textcoords="offset points")
b.axhline(0.05, color="#c0392b", ls="--", label="nominal 5%")
b.set_xscale("log"); b.set_xticks(ks); b.set_xticklabels(ks); b.set_xlim(ks[0], ks[-1] * 3)
b.set_xlabel("texts in the batch (k)"); b.set_ylabel("human batches flagged (test half)"); b.set_title("...but the threshold drifts, per family", fontsize=9)
b.legend(fontsize=7)
fig.tight_layout()
os.makedirs(os.path.join(HERE, "experiments"), exist_ok=True)
fig.savefig(os.path.join(HERE, "experiments", "figure.svg"))

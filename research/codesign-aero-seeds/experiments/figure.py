"""Mean held-out RMS error on the wide plant of every airframe over the replicates, with the min-max band, airframes
sorted by the wide-tuned mean. Reads results.json; writes seeds.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
W, Nw = np.array(R["rms"]["wide|wide"]), np.array(R["rms"]["nominal|wide"])
order = np.argsort(W.mean(0)); x = np.arange(W.shape[1])
fig, ax = plt.subplots(figsize=(7, 4.3))
for M, c, lab in ((Nw, "#c0504d", "gains tuned on the nominal plant"), (W, "#2f6fb0", "gains tuned on the wide plant")):
    ax.fill_between(x, M.min(0)[order], M.max(0)[order], color=c, alpha=0.2)
    ax.plot(x, M.mean(0)[order], color=c, lw=1.6, label=lab)
ax.set_xlabel(f"airframe, sorted by wide-tuned mean error (1 = best of {W.shape[1]})"); ax.set_ylabel("RMS roll error, wide plant (deg)")
ax.set_title(f"Mean and min-max band over {len(W)} independent tuning replicates", fontsize=9)
ax.legend(fontsize=8); fig.tight_layout(); fig.savefig(os.path.join(HERE, "seeds.png"), dpi=130)

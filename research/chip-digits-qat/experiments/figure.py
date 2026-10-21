"""Accuracy by weight width at A=4 for each quantiser, from results.txt -> accuracy_by_method.svg."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = os.path.dirname(__file__)
M = ("ptq_max", "ptq_clip", "perchannel", "qat")
rows = {}
for ln in open(os.path.join(here, "results.txt")):
    if ln.startswith("#"):
        if "float" in ln:
            fl = float(ln.split("mean")[1].split()[0])
        continue
    t = ln.split()
    rows[(int(t[0]), int(t[1]))] = {k: float(t[2 + 2 * i]) for i, k in enumerate(M)}
fig, ax = plt.subplots(figsize=(6.4, 4))
for i, k in enumerate(M):
    ax.bar([w + (i - 1.5) * 0.2 for w in (2, 3, 4)], [rows[(w, 4)][k] for w in (2, 3, 4)], 0.2, label=k)
ax.axhline(fl, ls=":", c="k", lw=1, label="float")
ax.set_xticks([2, 3, 4]); ax.set_xlabel("weight bits (activations 4 bit)"); ax.set_ylabel("test accuracy (mean of 5 splits)")
ax.legend(fontsize=7); fig.tight_layout(); fig.savefig(os.path.join(here, "accuracy_by_method.svg"))

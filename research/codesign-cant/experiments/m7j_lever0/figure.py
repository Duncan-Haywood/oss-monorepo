"""Figure for milestone 7j: held-out flights that diverged at lever 0 (no gust torque), 45 deg tilt-command limit, for the 18 retrained
`above` designs pooled (7h free, aware TWR=2.0, aware TWR free) and for 7e's 6, under each probe (one change from base). Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
probes = R["probes"]
RET = ("7h free", "aware TWR=2.0", "aware TWR free")


def count(probe, sets):
    o = next(r for r in R["runs"] if r["geom"] == "above" and r["cap"] == 45.0 and r["probe"] == probe)
    return int(sum(np.sum(d) for s, d in zip(o["sets"], o["dead"]) if s in sets))


ret = [count(p, RET) for p in probes]; e = [count(p, ("7e",)) for p in probes]
fig, ax = plt.subplots(figsize=(9, 4.2))
x = np.arange(len(probes)); w = 0.38
for xs, v, col, lab in ((x - w / 2, ret, "#d62728", "retrained designs (7h, 7i; 18 designs, of 1152)"), (x + w / 2, e, "#1f77b4", "7e's designs (6 designs, of 384)")):
    ax.bar(xs, v, width=w, color=col, label=lab)
    for xi, vi in zip(xs, v):
        ax.text(xi, vi, str(vi), ha="center", va="bottom", fontsize=8)
ax.set_xticks(x); ax.set_xticklabels(probes, fontsize=8)
ax.set_ylabel("held-out flights diverged")
ax.set_title("No gust torque, 45° tilt limit, centre of pressure above: every crash is a tip-over before the wind step (median 0.4 s)")
ax.title.set_fontsize(10)
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7j_lever0.png"), dpi=130)
print("wrote m7j_lever0.png", ret, e)

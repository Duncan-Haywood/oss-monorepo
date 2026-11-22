"""Figure for milestone 12f (section VI-d): held-out flights that diverged at twice the trained centre-of-pressure lever under one
probe at a time, at the 20 and 45 deg tilt-command limits, ten seeds per set: the margin-constrained `above` designs (pooled
M = 1.25, 1.43, 1.67; of 1,920), the unconstrained `above` designs and the constrained `below` designs (of 640 each). Whiskers are
the stratified bootstrap 95% intervals over seeds from stats.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "stats.json")))
PROBES = ["base", "dead85", "pos gains x0.5", "airmode", "airmode, 1.5x torque", "ideal mixer", "ideal mixer, 1.25x torque",
          "ideal mixer, 1.5x torque"]
NAMES = ["base", "dead bound 85°", "position gains ×0.5", "airmode mixer", "airmode, 1.5× torque", "ideal mixer",
         "ideal mixer, 1.25× torque", "ideal mixer, 1.5× torque"]
SETS = (("above|margin sets", "#1f77b4", "above, constrained, 3 sets (of 1,920)"),
        ("above|unconstrained", "#ff7f0e", "above, unconstrained (of 640)"),
        ("below|M=1.25", "#2ca02c", "below, constrained (of 640)"))

fig, ax = plt.subplots(1, 2, figsize=(12, 4.6), sharey=True)
y = np.arange(len(PROBES))
for a, cap in zip(ax, ("20", "45")):
    for j, (key, col, name) in enumerate(SETS):
        c = S[f"{key}|{cap}"]
        v = np.array([c[p]["total"] for p in PROBES]); lo = np.array([c[p]["lo"] for p in PROBES]); hi = np.array([c[p]["hi"] for p in PROBES])
        a.barh(y + (j - 1) * 0.27, v, height=0.27, color=col, label=name, xerr=[v - lo, hi - v], error_kw=dict(lw=0.8, capsize=2))
    a.set_yticks(y); a.set_yticklabels(NAMES); a.invert_yaxis()
    a.set_xlabel("held-out flights diverged at lever 2 (ten seeds)")
    a.set_title(f"{cap}° tilt-command limit")
ax[1].legend(fontsize=8, loc="upper right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m12f_authority.png"), dpi=130)
print("wrote m12f_authority.png")

"""Figure for milestone 7c: (left) each `above` design's attitude ki/kp against the ki/kp ceiling the linear model gives for the
integrator feed-forward; (right) the growth rate of the most unstable held-out plant against the share of held-out episodes that
diverged at lever 0, for every design-condition the linear model calls unstable (plus the stable ones at sigma <= 0). Reads results.json."""
import json, os, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import linstab as S  # noqa: E402

conds = json.load(open(os.path.join(HERE, "results.json")))["conds"]
STY = {"6b aware": ("o", "#7f7f7f", "6b, tuned without feed-forward"), "integ retrained": ("s", "#1f77b4", "retrained with integrator ff (7b)"),
       "6b+integ, ki 0.8x ceiling": ("v", "#2ca02c", "6b, ki at 0.8x ceiling (new)"), "6b+integ, ki 1.25x ceiling": ("^", "#ff7f0e", "6b, ki at 1.25x ceiling (new)")}
fig, ax = plt.subplots(1, 2, figsize=(11, 4.3))
for lab, (mk, col, name) in STY.items():
    cs = [c for c in conds if c["label"] == lab and c["geom"] == "above"]
    ax[0].scatter([c["ki_kp"] * c["ceil"] for c in cs], [c["ki_kp"] * c["ki_scale"] for c in cs], marker=mk, c=col, label=name, s=40)
lim = [3, 13.5]
ax[0].plot(lim, lim, "k--", lw=1, label="on the ceiling")
ax[0].set_xlabel("linear ki/kp ceiling with integrator feed-forward (1/s)")
ax[0].set_ylabel("design's own ki/kp (1/s)")
ax[0].set_title("Centre of pressure above: CMA-ES tuned onto the boundary")
ax[0].legend(fontsize=8)
ST2 = {"6b+integ": ("o", "#d62728", "6b + integrator ff"), "6b+integ, ki 1.25x ceiling": ("^", "#ff7f0e", "6b, ki 1.25x ceiling"),
       "m7 cmd-ff": ("D", "#9467bd", "commanded-torque ff (m7)")}
for lab, (mk, col, name) in ST2.items():
    cs = [c for c in conds if c["label"] == lab]
    ax[1].scatter([float(S.growth_rate(max(c["rho_ep"]))) for c in cs], [100 * np.mean(c["dead_0"]) for c in cs], marker=mk, c=col, label=name, s=40)
rest = [c for c in conds if c["label"] not in ST2]
ax[1].scatter([float(S.growth_rate(max(c["rho_ep"]))) for c in rest], [100 * np.mean(c["dead_0"]) for c in rest], marker=".", c="#7f7f7f", label="all others", s=25)
ax[1].axvline(0, color="k", lw=0.8)
ax[1].set_xlabel("growth rate of the worst held-out plant, ln(rho)/dt (1/s)")
ax[1].set_ylabel("held-out episodes diverged at lever 0 (%)")
ax[1].set_title("Unstable is necessary, not sufficient")
ax[1].legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7c_stab.png"), dpi=130)
print("wrote m7c_stab.png")

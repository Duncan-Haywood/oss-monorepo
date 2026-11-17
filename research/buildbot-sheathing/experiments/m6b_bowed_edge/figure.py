"""Figure for milestone 6b (the bowed bottom edge) from results.json and envelope.json:
python experiments/m6b_bowed_edge/figure.py"""
import json
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import bowed_edge as B  # noqa: E402

r = json.load(open(os.path.join(HERE, "results.json")))
rock = r["constants"]["three_foot_rock_deg"]
fig, ax = plt.subplots(1, 3, figsize=(14, 4.2))

# A. seated tilt against press on a smooth bow, with the stick band
f = r["F_draws"]
fn = np.array(f["f_n"])
ax[0].plot(fn, np.abs(f["mujoco_deg"]), "o", ms=2, mfc="none", color="C0", alpha=0.5, label="MuJoCo seat")
ax[0].plot(fn, np.abs(f["drake_deg"]), ".", ms=2, color="C3", alpha=0.5, label="Drake SAP seat")
g = np.linspace(5, 50, 50)
for mu, ls in ((0.3, ":"), (0.5, "--")):
    ax[0].plot(g, [math.degrees(B.stick_band(mu, x)) for x in g], "k", ls=ls, lw=1,
               label=f"stick band θ_s, μ {mu}")
ax[0].axhline(rock, color="0.4", lw=1.5, label="three-foot rock 2s/W (charged before)")
ax[0].set(xlabel="press against the wall F_n (N)", ylabel="seated |tilt| (deg)", ylim=(0, 0.16),
          title="A. A smooth 1/16 in bow rolls back to level;\nonly wall friction keeps a tilt")
ax[0].legend(fontsize=7, loc="upper left")

# B. edge shape: tent (kink) to flat-bottomed, theta0 +1 deg, mu 0.4
d = r["D"]
ps = sorted({x["p"] for x in d})
xs = np.arange(len(ps))
for k, (fnv, off) in enumerate(((5.0, -0.2), (50.0, 0.2))):
    for sim, col, o2 in (("drake", "C3", -0.07), ("mujoco", "C0", 0.07)):
        v = [abs(next(x[f"{sim}_deg"] for x in d if x["p"] == p and x["fn"] == fnv)) for p in ps]
        ax[1].bar(xs + off + o2, v, 0.13, color=col, alpha=1.0 if fnv == 50 else 0.45,
                  label=f"{'Drake' if sim == 'drake' else 'MuJoCo'}, F_n {fnv:.0f} N")
ax[1].axhline(rock, color="0.4", lw=1.5)
ax[1].set_xticks(xs, [f"p = {p:g}" + (" (kink)" if p == 1 else " (parabola)" if p == 2 else "") for p in ps],
                 fontsize=8)
ax[1].set(ylabel="seated |tilt| (deg), holder error +1°",
          title="B. Edge shape z = −s(1 − |2y/W|^p):\na kink can keep the full rock, a curve only what friction holds")
ax[1].legend(fontsize=7)

# C. clean sheets, single-2x ledger pipelines
c = [x for x in r["F_clean"] if x["framing"] == "2x"]
lab = [f"{x['s_x_mm']} mm, {x['warp']}, {x['policy']}" for x in c]
y = np.arange(len(c))
ax[2].barh(y - 0.2, [x["three_foot"] for x in c], 0.4, color="0.6", label="three-foot rock (milestones 5, 6)")
ax[2].barh(y + 0.2, [x["drake"] for x in c], 0.4, color="C3", label="smooth bow, Drake seats")
ax[2].plot([x["mujoco"] for x in c], y + 0.2, "|", color="C0", ms=8, label="smooth bow, MuJoCo seats")
ax[2].set_yticks(y, lab, fontsize=7)
ax[2].invert_yaxis()
ax[2].set(xlabel="first-pass clean sheets (single 2x joints)",
          title="C. Single-2x pipelines gain 1.8–6.9 points;\ndoubled joints move under 0.5")
ax[2].legend(fontsize=7, loc="lower right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)

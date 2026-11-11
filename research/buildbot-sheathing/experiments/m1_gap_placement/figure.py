"""Figure for milestone 1 from results.json:  python experiments/m1_gap_placement/figure.py"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(1, 3, figsize=(13, 3.8))

a = r["A"]
g = [x["gap_in"] * 25.4 for x in a]
ax[0].plot(g, [x["stud95_mm"] for x in a], "o-", label="stud estimate (tip 0.9 mm)")
ax[0].plot(g, [x["tip95_mm"] for x in a], "s--", label="tip scatter (perfect studs)")
ax[0].axvline(3.175, color="grey", lw=0.8, ls=":")
ax[0].text(3.25, 1.15, "APA 1/8 in gap", fontsize=8, color="grey")
ax[0].set(xlabel="gap between panels, centred on the joint stud (mm)", ylabel="1σ allowed for 95% clean sheets (mm)",
          title="A. The gap shrinks the joint budget")
ax[0].legend(fontsize=8)

b = r["B_rotation_grid"]
for k, m in (("nominal", "o-"), ("edge 0.5 mm", "s-")):
    ax[1].plot(b["deg"], b[k], m, label={"nominal": "aim at design window", "edge 0.5 mm": "aim from measured edge"}[k])
ax[1].set_xscale("symlog", linthresh=0.02)
ax[1].set(xlabel="sheet rotation 1σ (degrees)", ylabel="clean sheets (all 62 nails in)", ylim=(0, 1),
          title="B. A sheet must hang plumb to ~0.03°")
ax[1].legend(fontsize=8)

c = r["C"]
for k, m in (("butt, full 48 in, edge aim", "o-"), ("butt, 1/16 trim, edge aim", "s-"),
             ("butt, 1/8 trim, edge aim", "^-"), ("stud, 1/16 trim, edge aim", "d-")):
    ax[2].plot(range(1, 11), c[k]["clean"], m, label=k.replace(", edge aim", ""))
ax[2].set(xlabel="sheet number along a 40 ft wall", ylabel="clean sheets", ylim=(0, 1.02),
          title="C. Butted rows drift off the studs")
ax[2].legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")

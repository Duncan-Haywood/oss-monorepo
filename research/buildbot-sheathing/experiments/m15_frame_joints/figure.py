"""Figure for milestone 15: python experiments/m15_frame_joints/figure.py (reads results.json and
../m14_escaped/results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
M14 = json.load(open(os.path.join(HERE, "..", "m14_escaped", "results.json")))

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.8))
D = R["D"]
rhos = np.array([float(k) for k in D["grid"]])
grid = np.array([D["grid"][k] for k in D["grid"]])
for j, om in enumerate(D["omegas"]):
    a.plot(rhos, grid[:, j] * 100, marker="o", ms=3, lw=1.6, label=f"withdrawal {om:g} F")
rho = R["A"]["DF-L framing (G 0.50)"]["rho"]
a.axvline(rho, color="k", lw=0.8, ls=":")
a.text(rho * 1.04, 80, f"NDS ratio\n{rho:.2f}", fontsize=8)
a.axhspan(40, 60, color="C3", alpha=0.10)
a.text(4.5, 50, "Weiss (2017):\n\"close to or more\nthan half\"", fontsize=8, va="center")
a.axhline(D["noholddown"]["weiss_loss_w1"] * 100, color="C3", lw=1, ls="--")
a.text(2.7, D["noholddown"]["weiss_loss_w1"] * 100 + 1.5, "no hold-downs, withdrawal 1 F", fontsize=7, color="C3")
a.set_xscale("log")
a.set_xticks([0.25, 0.5, 1, 2, 4, 8])
a.set_xticklabels(["0.25", "0.5", "1", "2", "4", "8"])
a.minorticks_off()
a.set_xlabel("stud-to-plate joint lateral capacity / one sheathing nail (rho)")
a.set_ylabel("capacity lost with every nail below 12 in omitted (%)")
a.set_title("Fully anchored sheet: only weak stud joints reach Weiss's loss", fontsize=10)
a.legend(fontsize=8, loc="lower left")
a.grid(alpha=0.3)

q = np.array(R["cap_quantiles"]["q"]) / 100
qm = np.array(M14["cap_quantiles"]["q"]) / 100
for lab, col in (("single 2x, three reads", "C0"), ("single 2x, full stack", "C2"),
                 ("single 2x, three reads, 4 in joint edges", "C1")):
    b.plot(R["cap_quantiles"][lab], q, color=col, lw=2, drawstyle="steps-post", label=f"{lab} (NDS joints)")
    if lab in M14["cap_quantiles"]:
        b.plot(M14["cap_quantiles"][lab], qm, color=col, lw=1, ls="--", drawstyle="steps-post")
b.plot([], [], color="grey", ls="--", lw=1, label="milestone 14 (rigid joints)")
b.axvline(1.0, color="k", lw=0.8, ls=":")
b.set_xlim(0.75, 1.4)
b.set_ylim(0, 0.2)
b.set_xlabel("racking capacity with every miss left in / intact 6 in sheet")
b.set_ylabel("fraction of sheets at or below (lower tail)")
b.set_title("Escaped misses, measured studs, 20,000 sheets", fontsize=10)
b.legend(fontsize=7, loc="upper left")
b.grid(alpha=0.3)

fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")

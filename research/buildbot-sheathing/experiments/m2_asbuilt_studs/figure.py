"""Figure for milestone 2 from results.json:  python experiments/m2_asbuilt_studs/figure.py"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(1, 3, figsize=(14, 4))
POL = ["single", "ends", "three", "dense"]
COL = dict(zip(POL, ["C0", "C1", "C2", "C3"]))

# A. policy x joint framing, low and high published warp
h = r["H"]
groups = [("2x (1.5 in)", "low (0.11, 0.08 in)"), ("2x (1.5 in)", "high (0.21, 0.16 in)"),
          ("3x (2.5 in)", "low (0.11, 0.08 in)"), ("3x (2.5 in)", "high (0.21, 0.16 in)"),
          ("2 x 2x (3.0 in)", "low (0.11, 0.08 in)"), ("2 x 2x (3.0 in)", "high (0.21, 0.16 in)")]
w = 0.2
for i, pol in enumerate(POL):
    ax[0].bar([g + (i - 1.5) * w for g in range(len(groups))], [h[f"{j}|{k}"][pol] for j, k in groups], w, label=pol, color=COL[pol])
ax[0].axhline(0.95, color="grey", lw=0.8, ls=":")
ax[0].set_xticks(range(len(groups)))
ax[0].set_xticklabels([f"{j.split(' (')[0]}\n{k.split(' (')[0]} warp" for j, k in groups], fontsize=7)
ax[0].set(ylabel="clean sheets (all 62 nails in)", ylim=(0, 1.22), title="A. Wider joint framing beats better sensing")
ax[0].legend(fontsize=7, title="stud reads", title_fontsize=7, loc="upper center", ncol=4)

# B. culling
f = r["F"]
cuts = sorted(f, key=float)
for pol, m in (("single", "o-"), ("three", "s-"), ("dense", "^-")):
    ax[1].plot([f[c]["cull_share"] * 100 for c in cuts], [f[c][pol] for c in cuts], m, label=pol, color=COL[pol])
for c in cuts:
    if float(c) in (0.0625, 0.125, 0.25):
        ax[1].annotate(f'{float(c):g} in', (f[c]["cull_share"] * 100, f[c]["dense"]), fontsize=7,
                       textcoords="offset points", xytext=(4, 6))
ax[1].axhline(0.95, color="grey", lw=0.8, ls=":")
ax[1].set(xlabel="studs rejected for bow (%)", ylabel="clean sheets", ylim=(0, 1.05),
          title="B. Culling bowed 2x studs: 65% rejected to near 95%")
ax[1].legend(fontsize=8)

# C. plate layout lean
g = r["G"]
xs = sorted(g, key=float)
for pol, m in zip(POL, ("o-", "v-", "s-", "^-")):
    ax[2].plot([float(x) for x in xs], [g[x][pol] for x in xs], m, label=pol, color=COL[pol])
ax[2].set(xlabel="plate layout error at each stud end, 1σ (mm)", ylabel="clean sheets", ylim=(0, 1.05),
          title="C. Lean on top of bow (2x joints, low warp)")
ax[2].legend(fontsize=8)

fig.suptitle("buildbot-sheathing milestone 2: Stud-grade bow and twist against the joint-nail window "
             "(tool 0.9 mm, read 0.5 mm, edge 0.5 mm)", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)

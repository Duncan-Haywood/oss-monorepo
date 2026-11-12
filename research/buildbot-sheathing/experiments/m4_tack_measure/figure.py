"""Figure for milestone 4 from results.json:  python experiments/m4_tack_measure/figure.py"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(1, 3, figsize=(14, 4))
FR = ["2x (1.5 in)", "3x (2.5 in)", "2 x 2x (3.0 in)"]
COL = dict(zip(FR, ["C3", "C1", "C2"]))

# A. hang allowed (rotation, 1 sigma) by framing, studs and aim
a = r["A"]
groups = [(f, s) for f in FR for s in ("straight", "low warp")]
w = 0.38
for i, aim in enumerate(("nominal", "edge")):
    vals = [next(x for x in a if x["framing"] == f and x["studs"] == s and x["aim"] == aim)["s_theta_deg"]
            for f, s in groups]
    bars = ax[0].bar([g + (i - 0.5) * w for g in range(len(groups))], vals, w,
                     label={"nominal": "aim at design", "edge": "aim from measured edge"}[aim],
                     color=["C7", "C0"][i])
    for b, v in zip(bars, vals):
        ax[0].annotate(f"{v:.2f}" if v else "0", (b.get_x() + b.get_width() / 2, v), ha="center",
                       fontsize=6, textcoords="offset points", xytext=(0, 2))
ax[0].set_xticks(range(len(groups)))
ax[0].set_xticklabels([f"{f.split(' (')[0]}\n{s}" for f, s in groups], fontsize=7)
ax[0].set(ylabel="sheet rotation allowed, deg (1σ)", ylim=(0, 0.65),
          title="A. Hang allowed for 95% clean sheets (tacked)")
ax[0].legend(fontsize=7, loc="upper left")

# B. sway of a held sheet
for c in r["C"]:
    if c["studs"] != "low warp" and c["framing"] != "2x (1.5 in)":
        continue
    ls = "-" if c["studs"] == "low warp" else "--"
    ax[1].plot(c["sway_mm"], c["clean"], "o" + ls, ms=3, color=COL[c["framing"]],
               label=f"{c['framing'].split(' (')[0]}, {c['studs']}")
ax[1].axhline(0.95, color="grey", lw=0.8, ls=":")
ax[1].set(xlabel="per-nail sway of a held sheet, mm (1σ)", ylabel="clean sheets", ylim=(0, 1.05),
          title="B. Holding the sheet while nailing")
ax[1].legend(fontsize=7)

# C. re-hang on single 2x, straight studs
d = [x for x in r["D"] if x["framing"] == "2x (1.5 in)" and x["studs"] == "straight"]
for hang, m in (("1 mm, 0.1 deg", "o-"), ("2 mm, 0.2 deg", "s-"), ("3 mm, 0.3 deg", "^-")):
    rows = [x for x in d if x["hang"] == hang]
    xs = [0 if x["threshold_mm"] is None else x["threshold_mm"] for x in rows]
    ax[2].plot(xs, [x["clean"] for x in rows], m, label=f"hang {hang}")
    for x, row in zip(xs, rows):
        ax[2].annotate(f"{row['hangs']:.1f}", (x, row["clean"]), fontsize=6, textcoords="offset points", xytext=(3, 3))
ax[2].axhline(0.95, color="grey", lw=0.8, ls=":")
ax[2].set(xlabel="re-hang below this predicted half-window, mm (0 = never)",
          ylabel="clean sheets", ylim=(0, 1.05),
          title="C. Re-hanging, single 2x (labels: hangs a sheet)")
ax[2].legend(fontsize=7, loc="lower left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)

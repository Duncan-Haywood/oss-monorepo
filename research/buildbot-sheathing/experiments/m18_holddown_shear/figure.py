"""Figure for milestone 18: python experiments/m18_holddown_shear/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
A, G, F = R["A"], R["grid"], R["F"]
KEPT = {"6": 2649 / 4688, "3": 2974 / 8775}

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.8))
for s, ls in (("0.0", "-"), ("2.0", "--"), ("inf", ":")):
    fs = sorted(float(f) for f in G[s]["kept"])
    for i, (lab, col) in enumerate((("6-12", "C0"), ("3-12", "C3"))):
        y = [G[s]["kept"][str(round(f, 2))][i] * 100 for f in fs]
        sl = "rigid" if s == "inf" else f"{float(s):g} F"
        a.plot(fs, y, color=col, ls=ls, lw=2, label=f"decay {lab}, shear path {sl}")
for lab, col in (("6", "C0"), ("3", "C3")):
    a.axhline(KEPT[lab] * 100, color=col, lw=1, alpha=0.5)
    a.text(1.48, KEPT[lab] * 100 + 1, f"tested {lab}-12", color=col, ha="right", fontsize=8)
a.set_xlabel("stud-to-plate end-nail strength (multiple of the NDS ratio)")
a.set_ylabel("share of the intact wall's capacity kept (%)")
a.set_title("Decayed walls: end-stud shear path locks the slide")
a.legend(fontsize=7, loc="lower right")
a.set_ylim(0, 100)

W = F["window"]
ss = sorted(float(s) for s in W)
fit = [W[str(s) if str(s) in W else repr(s)]["fit"] for s in ss]
rms = [W[str(s)]["rms"] * 100 for s in ss]
b.plot(ss, fit, "o-", color="C2", label="best end-nail multiple")
b.set_xlabel("anchor-rod shear path at each end stud, s (units of one sheathing nail's F)")
b.set_ylabel("best-fit end-nail multiple of the NDS ratio", color="C2")
b2 = b.twinx()
b2.plot(ss, rms, "s--", color="C7", label="rms miss (points)")
b2.set_ylabel("rms miss to the two tested shares (points)", color="C7")
b2.set_ylim(0, 6)
b.axvline(A["s_rod_F"], color="k", lw=1)
b.text(A["s_rod_F"] + 0.05, 0.42, f"NDS design value\nof one rod ({A['z_rod_lb']:.0f} lb)", fontsize=8)
b.set_title("The stronger the rod, the weaker the nails must be")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)

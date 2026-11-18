"""Figure for milestone 20: python experiments/m20_cyclic/figure.py (reads results.json and loops.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
LO = json.load(open(os.path.join(HERE, "loops.json")))
KEPT = [2649 / 4688, 2974 / 8775]

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.8))
for key, col, lab in (("3-intact", "C0", "intact 3-12"), ("3-decay", "C3", "decayed 3-12")):
    lp = LO[key]
    a.plot(lp["d_mm"], lp["F"], color=col, lw=0.6, alpha=0.8, label=f"{lab}, CUREE history")
    a.plot(LO["mono_drift_mm"], LO["mono"][key], color=col, lw=2, ls="--", label=f"{lab}, monotonic push")
a.set_xlabel("top-plate drift (mm)")
a.set_ylabel("racking load (nail peaks, FU)")
a.set_title("Pinched loops, same peaks as the monotonic push")
a.legend(fontsize=7, loc="lower right")
a.axhline(0, color="k", lw=0.5)

rows = [r for r in R["D"] if abs(r["gap_in"] - 1 / 16) < 1e-9]
for lam, ls in ((1.0, "-"), (0.25, "--")):
    rr = sorted((r for r in rows if r["lam"] == lam), key=lambda r: r["m"])
    for i, (col, lab) in enumerate((("C0", "6-12"), ("C3", "3-12"))):
        b.plot([r["m"] for r in rr], [100 * r["cyclic"][i] for r in rr], color=col, ls=ls, lw=2, marker="o", ms=3,
               label=f"decay {lab}, cyclic, joint slip x{lam:g}")
        b.plot([r["m"] for r in rr], [100 * r["mono"][i] for r in rr], color=col, ls=ls, lw=1, alpha=0.4,
               marker="x", ms=4)
for i, col in enumerate(("C0", "C3")):
    b.axhline(100 * KEPT[i], color=col, lw=1, alpha=0.5)
b.text(1.0, 100 * KEPT[1] - 5, "tested (Weiss 2017)", ha="right", fontsize=8)
b.set_xlabel("16d end-nail strength (multiple of the NDS ratio)")
b.set_ylabel("share of intact capacity kept (%)")
b.set_title("Cyclic (bold) against monotonic (faint): gap 1/16 in")
b.set_ylim(0, 100)
b.legend(fontsize=7, loc="lower right")
fig.suptitle("Weiss's wall under the CUREE protocol with SAWS nails (Anderson et al. 2007 parameters)", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)

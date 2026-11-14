"""Figure for milestone 19: python experiments/m19_wall_pushover/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
G = json.load(open(os.path.join(HERE, "results.json")))["grid"]
KEPT = {"kept6": 2649 / 4688, "kept3": 2974 / 8775}


def pick(**kw):
    return [r for r in G if all(abs(r[k] - v) < 1e-9 for k, v in kw.items())]


fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.8))
for m, col in ((0.25, "C2"), (0.47, "C0"), (0.75, "C1"), (1.0, "C3")):
    for lam, ls in ((1.0, "-"), (0.25, "--")):
        rows = sorted(pick(m=m, lam=lam, cap=2.55, dp_mm=12), key=lambda r: r["gap_in"])
        a.plot([r["gap_in"] * 25.4 for r in rows], [100 * r["kept3"] for r in rows], color=col, ls=ls, lw=2,
               marker="o", ms=3, label=f"end nails {m:g} x NDS, joint slip x{lam:g}")
a.axhline(100 * KEPT["kept3"], color="k", lw=1)
a.text(6.3, 100 * KEPT["kept3"] + 1.5, "tested (Weiss 2017)", ha="right", fontsize=8)
a.set_xlabel("slack before the anchor rod bears (mm)")
a.set_ylabel("decayed 3-12 wall: share of intact capacity kept (%)")
a.set_title("Slack at the rods barely moves the decayed wall")
a.set_ylim(0, 110)
a.legend(fontsize=7, loc="upper center", ncol=2)

for key, col, lab in (("kept6", "C0", "6-12"), ("kept3", "C3", "3-12")):
    for lam, ls in ((1.0, "-"), (0.25, "--")):
        rows = sorted(pick(lam=lam, gap_in=0.0, cap=2.55, dp_mm=12), key=lambda r: r["m"])
        b.plot([r["m"] for r in rows], [100 * r[key] for r in rows], color=col, ls=ls, lw=2, marker="o", ms=3,
               label=f"decay {lab}, joint slip x{lam:g}")
    b.axhline(100 * KEPT[key], color=col, lw=1, alpha=0.5)
b.set_xlabel("16d end-nail strength (multiple of the NDS ratio)")
b.set_ylabel("share of intact capacity kept (%)")
b.set_title("Only end nails at about a quarter of NDS fit both groups")
b.set_ylim(0, 100)
b.legend(fontsize=7, loc="lower right")
fig.suptitle("Weiss's wall pushed over: softening nails, rod path at its design value (2.55 F), no slack (right)",
             fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)

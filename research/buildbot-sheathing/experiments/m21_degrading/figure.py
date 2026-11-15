"""Figure for milestone 21: python experiments/m21_degrading/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
KEPT = [2649 / 4688, 2974 / 8775]


def x(g):
    return 0.0 if g == "inf" else 1.0 / float(g)


fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.6))
for m, col in zip((0.25, 0.47, 1.0), ("C2", "C1", "C0")):
    rr = sorted((r for r in R["C"] if r["m"] == m), key=lambda r: x(r["gamma"]))
    xs = [x(r["gamma"]) for r in rr]
    a.plot(xs, [100 * r["shares"][1] for r in rr], color=col, lw=2, marker="o", ms=4,
           label=f"decayed 3-12, end nails {m:g} x NDS")
    a.plot(xs, [100 * r["shares"][0] for r in rr], color=col, lw=1, ls="--", marker="x", ms=4,
           label=f"decayed 6-12, end nails {m:g} x NDS")
    b.plot(xs, [100 * r["intact_vs_mono"][1] for r in rr], color=col, lw=2, marker="o", ms=4,
           label=f"intact 3-12, {m:g} x NDS")
    b.plot(xs, [100 * r["intact_vs_mono"][0] for r in rr], color=col, lw=1, ls="--", marker="x", ms=4,
           label=f"intact 6-12, {m:g} x NDS")
for k, ls in zip(KEPT, ("--", "-")):
    a.axhline(100 * k, color="k", lw=0.8, ls=ls, alpha=0.5)
a.text(0.2, 100 * KEPT[1] + 1.5, "tested 3-12 (Weiss 2017)", ha="right", fontsize=8)
a.text(0.2, 100 * KEPT[0] + 1.5, "tested 6-12", ha="right", fontsize=8)
for ax in (a, b):
    ax.set_xlabel("degradation rate 1/γ (0: SAWS, milestone 20)")
a.set_ylabel("share of intact cyclic peak kept (%)")
a.set_title("Energy-based nail damage nudges the decayed shares up, not down")
a.set_ylim(0, 100)
a.legend(fontsize=7, loc="lower left")
b.set_ylabel("intact wall: cyclic peak / monotonic peak (%)")
b.set_title("...while it cuts the intact walls' cyclic peaks")
b.legend(fontsize=7, loc="lower left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)

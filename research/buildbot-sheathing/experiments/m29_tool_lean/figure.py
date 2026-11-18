"""Figure for milestone 29: python experiments/m29_tool_lean/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
base = R["B"]["stack_old"]

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.4))
for i, n in enumerate(("g1", "h1")):
    rows = [r for r in R["C"] if r["robot"] == n and r["mult"] == 1]
    a.plot([r["L"] for r in rows], [r["clean"] for r in rows], "o-", color=f"C{i}",
           label=f"stock {n.upper()}, 11-bit joints, nail 44 mm deep")
a.axhline(base, color="0.4", ls="--", lw=1.2)
a.text(0.01, base + 0.02, f"0.9 mm at the hand point (milestones 1-28): {base:.3f}", fontsize=8)
a.set(xlabel="nailer nose ahead of the grip, L (m)", ylabel="clean sheets, best single-2x stack", ylim=(0, 1.02),
      title="A. The nailer's length")
a.legend(fontsize=8, loc="lower left")
rows = R["D"]["rows"]
b.plot([r["lean_deg"] for r in rows], [r["clean"] for r in rows], "o-", color="C0", label="single 2x joints")
b.plot([r["lean_deg"] for r in rows], [r["doubled"] for r in rows], "s-", color="C2", label="doubled joint studs")
b.axvline(R["D"]["tolerance_2pt_deg"], color="0.4", ls=":", lw=1.2)
b.text(R["D"]["tolerance_2pt_deg"] + 0.05, 0.55, f"2-point loss at {R['D']['tolerance_2pt_deg']:.2f} deg", fontsize=8)
b.set(xlabel="independent nail lean, 1 sigma (deg)", ylabel="clean sheets", ylim=(0, 1.02),
      title="B. The nail's lean (G1, 11-bit, L 0.3 m)")
b.legend(fontsize=8, loc="center right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)

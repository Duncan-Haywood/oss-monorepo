"""Figure for milestone 30: python experiments/m30_backlash/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.4))
styles = {"unpreloaded": ("C3", "o-"), "preloaded": ("C0", "s-"), "preloaded, legs loose": ("C1", "^--"),
          "preloaded, ankle rolls biased": ("C2", "d-")}
for mode, (c, st) in styles.items():
    rows = [x for x in R["D"] if x["robot"] == "g1" and x["mode"] == mode and x["bits"] == 12]
    if rows:
        a.plot([x["gap"] for x in rows], [x["clean"] for x in rows], st, color=c, label=mode)
a.axhline(0.90, color="0.5", ls=":", lw=1)
a.set(xlabel="gear backlash per joint, total gap (arcmin)", ylabel="clean sheets, best single-2x stack",
      ylim=(0, 1.02), title="A. G1, 12-bit joints, nose 0.3 m ahead")
a.legend(fontsize=8, loc="lower left")
for i, d in enumerate(("up", "down")):
    for j, n in enumerate(("g1", "h1")):
        rows = [x for x in R["A"]["lateral"] if x["robot"] == n and x["dir"] == d]
        b.plot([0] + [x["r"] for x in rows], [rows[0]["ref11"]] + [x["b11"] for x in rows], "o-" if d == "up" else "s--",
               color=f"C{j}", label=f"{n.upper()} 11-bit, grip {d}")
b.set(xlabel="handle's offset from the drive axis (m)", ylabel="clean sheets", ylim=(0, 0.8),
      title="B. Where the handle sits (sideways: no change)")
b.legend(fontsize=8, loc="upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)

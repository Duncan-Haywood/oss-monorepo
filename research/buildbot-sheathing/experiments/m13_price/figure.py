"""Figure for milestone 13: python experiments/m13_price/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))

fig, ax = plt.subplots(figsize=(9, 5.4))
rows = R["A"]["measured"]
for r in rows:
    lab = r["label"]
    dbl = lab[0] == "2x2x"
    col = "C3" if dbl else {"three": "C0", "dense": "C1", "local": "C2"}[lab[0]]
    mk = "s" if dbl else ("o" if lab[1] == "point" else "^")
    ax.scatter(r["clean"], r["median_usd"]["100"], c=col, marker=mk, s=46, zorder=3,
               edgecolors="k" if lab[3] == "slide+shim" else "none")
front = R["E"]
ax.plot([e["clean"] for e in front], [e["median_usd"] for e in front], "k:", lw=1, zorder=2)
for name, col, mk in (("three reads (point)", "C0", "o"), ("dense reads", "C1", "o"), ("per-nail reads", "C2", "o"),
                      ("line laser", "0.5", "^"), ("point reads", "0.5", "o"), ("doubled joint stud", "C3", "s")):
    ax.scatter([], [], c=col, marker=mk, label=name)
ax.scatter([], [], c="w", edgecolors="k", label="with slide and shim")
ax.annotate("full single-2x stack\n(per-nail reads, push,\nslide and shim)",
            (0.7707, R["H58"]["full_median"]), (0.60, 9.6), fontsize=8, arrowprops=dict(arrowstyle="->", lw=0.7))
ax.annotate("three reads, ledger", (0.4253, R["H58"]["lowest_median"]), (0.43, 6.0), fontsize=8,
            arrowprops=dict(arrowstyle="->", lw=0.7))
ax.set_xlabel("first-pass clean sheets (all 62 nails on wood), six scanned studs")
ax.set_ylabel("median $ per clean sheet, G1 on a lift base, 100 houses a year")
ax.set_xlim(0.38, 1.03)
ax.set_title("Milestone 13: first-pass quality is cheap up to 0.77; the last 23 points cost a stud\n"
             "(4,000 cost draws; every missed nail re-driven; dotted line: cheapest pipeline at each quality)",
             fontsize=10)
ax.legend(fontsize=8, loc="upper left")
ax.grid(alpha=0.3)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)

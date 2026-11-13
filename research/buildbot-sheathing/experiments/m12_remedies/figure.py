"""Figure for milestone 12: python experiments/m12_remedies/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))["A"]
STUDS = [("straight", "straight studs"), ("own parabola", "each stud's own parabola"),
         ("measured, common removed", "measured, common part removed"), ("measured", "measured (110 mm mean)")]
COMBOS = [("three", "no push", "ledger", "three reads"),
          ("local", "no push", "ledger", "per-nail reads"),
          ("local", "mid push", "ledger", "per-nail reads\n+ mid push"),
          ("local", "mid push", "slide+shim 0.5 mm", "per-nail reads + push\n+ slide and shim")]

fig, ax = plt.subplots(figsize=(10, 5.4))
w = 0.2
x = np.arange(len(COMBOS))
for i, (key, lab) in enumerate(STUDS):
    vals = [R[f"{key}|{e}|{p}|{pl}"]["clean"] for e, p, pl, _ in COMBOS]
    lo = [R[f"{key}|{e}|{p}|{pl}"]["lo"] for e, p, pl, _ in COMBOS]
    hi = [R[f"{key}|{e}|{p}|{pl}"]["hi"] for e, p, pl, _ in COMBOS]
    err = np.array([np.subtract(vals, lo), np.subtract(hi, vals)])
    ax.bar(x + (i - 1.5) * w, vals, w, yerr=err, capsize=2, label=lab, color=f"C{i}")
ax.axhline(0.95, color="k", ls=":", lw=1)
ax.text(len(COMBOS) - 0.5, 0.955, "95% target", ha="right", fontsize=8)
ax.set_xticks(x, [c[3] for c in COMBOS], fontsize=9)
ax.set_ylabel("clean sheets (all 62 nails on wood), single 2x joints")
ax.set_ylim(0, 1.02)
ax.set_title("Milestone 12: single-2x remedies on six scanned studs\n(20,000 sheets each, 95% Wilson intervals; "
             "doubled joints give 1.000 in every cell)", fontsize=10)
ax.legend(fontsize=8, loc="upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)

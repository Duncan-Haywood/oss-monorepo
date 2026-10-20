"""Figure: ladder of fixed generators and the loop's reference AUROC by round. Needs matplotlib."""
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import report  # noqa: E402

rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(HERE, "..", "results", "ladder.txt"))][1:]
series = report.main()
fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.2), gridspec_kw={"width_ratios": [1.2, 1]})
names = [r[0] for r in rows][::-1]
a.barh(names, [float(r[1]) for r in rows][::-1], color="#3b6ea5")
a.axvline(0.5, color="#888", ls="--", lw=1)
a.set_xlim(0.4, 1.02)
a.set_xlabel("reference detector AUROC on held-out people (0.5 = cannot tell)")
a.set_title("Fixed generators")
for name, (rounds, ref, lp) in series.items():
    m = ref.mean(0)
    b.plot(rounds, m, marker="o", label=name)
    b.fill_between(rounds, ref.min(0), ref.max(0), alpha=0.15)
b.axhline(0.5, color="#888", ls="--", lw=1)
b.set_ylim(0.4, 1.02)
b.set_xlabel("round")
b.set_ylabel("reference AUROC (mean, min to max over seeds)")
b.set_title("Loop imitator vs unseen reference detector")
b.legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.svg"))

"""Figure: on 64 injected leaks (held out), the 300 m hits of step 24's shape-chosen rule (R30)
against step 21's newest source (T-D), step 22's steepest (S30) and step 23's shape-timed (C30),
by leak type, with the chance expectation.

    python experiments/step25-heldout/figure.py   # writes experiments/step25-heldout/heldout.svg

Reads this step's leaks.tsv.
"""
import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
RULES = (("R30", "R30 shape-chosen (step 24)"), ("TD", "T-D newest (step 21)"), ("S30", "S30 steepest (step 22)"),
         ("C30", "C30 shape-timed (step 23)"))


def main():
    with open(HERE / "leaks.tsv") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    groups = [("bursts (abrupt)", lambda r: r["kind"] == "abrupt"), ("slow leaks (incipient)", lambda r: r["kind"] == "incipient"),
              ("all", lambda r: True)]
    fig, ax = plt.subplots(figsize=(8, 3.6))
    w = 0.2
    colours = ("#2f6db5", "#7a7a7a", "#d17a22", "#4f9a5a")
    for gi, (lab, sel) in enumerate(groups):
        g = [r for r in rows if sel(r)]
        for ri, (key, name) in enumerate(RULES):
            x = gi + (ri - 1.5) * w
            hits = sum(float(r[key]) <= 300 for r in g)
            ax.bar(x, hits, w, color=colours[ri], label=name if gi == 0 else None)
            ax.text(x, hits + 0.3, str(hits), ha="center", fontsize=7)
        ch = sum(float(r["pi"]) for r in g)
        ax.plot([gi - 2 * w, gi + 2 * w], [ch, ch], color="#c03030", lw=1.2, ls="--", label="chance" if gi == 0 else None)
        ax.text(gi, -2.2, f"{len(g)} leaks", ha="center", fontsize=7, color="#555")
    ax.set_xticks(range(len(groups)), [g[0] for g in groups], fontsize=8)
    ax.set_ylabel("injected leaks within 300 m")
    ax.set_ylim(-2.8, None)
    ax.legend(fontsize=7, loc="upper left")
    ax.set_title("L-Town, step 25: 64 held-out leaks injected through L-TOWN_Real.inp, rules frozen", fontsize=9)
    fig.tight_layout()
    fig.savefig(HERE / "heldout.svg")


if __name__ == "__main__":
    main()

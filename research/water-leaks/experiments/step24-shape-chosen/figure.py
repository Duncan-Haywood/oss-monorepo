"""Figure: per leak, the 300 m outcome of step 24's shape-chosen rule (R30) against step 21's
latest onset (T-D) and step 22's steepest atom (S30), split by whether any recently dated atom
fitted as a ramp.

    python experiments/step24-shape-chosen/figure.py   # writes experiments/step24-shape-chosen/shape_chosen.svg

Reads this step's leaks.tsv.
"""
import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
RULES = (("R30", "R30 shape-chosen"), ("S30", "S30 steepest"), ("TD", "T-D newest"))


def main():
    with open(HERE / "leaks.tsv") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    groups = [("ramp candidate,\nburst", lambda r: r["n_ramp"] != "0" and r["kind"] == "abrupt"),
              ("ramp candidate,\nslow leak", lambda r: r["n_ramp"] != "0" and r["kind"] == "incipient"),
              ("no ramp,\nburst", lambda r: r["n_ramp"] == "0" and r["kind"] == "abrupt"),
              ("no ramp,\nslow leak", lambda r: r["n_ramp"] == "0" and r["kind"] == "incipient")]
    fig, ax = plt.subplots(figsize=(8, 3.6))
    w = 0.26
    colours = ("#2f6db5", "#d17a22", "#7a7a7a")
    for gi, (lab, sel) in enumerate(groups):
        g = [r for r in rows if sel(r)]
        for ri, (key, name) in enumerate(RULES):
            hits = sum(float(r[key]) <= 300 for r in g)
            ax.bar(gi + (ri - 1) * w, hits, w, color=colours[ri], label=name if gi == 0 else None)
            ax.text(gi + (ri - 1) * w, hits + 0.1, str(hits), ha="center", fontsize=7)
        ax.text(gi, -1.3, f"{len(g)} leaks", ha="center", fontsize=7, color="#555")
    ax.set_xticks(range(len(groups)), [g[0] for g in groups], fontsize=8)
    ax.set_ylabel("leaks within 300 m")
    ax.set_ylim(-1.6, None)
    ax.legend(fontsize=7, loc="upper right")
    ax.set_title("L-Town, step 24: the steepest fitted ramp, else the newest source, by group", fontsize=9)
    fig.tight_layout()
    fig.savefig(HERE / "shape_chosen.svg")


if __name__ == "__main__":
    main()

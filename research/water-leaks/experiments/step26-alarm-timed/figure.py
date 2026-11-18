"""Figure: on the leaks D1-L detects, 300 m hits of step 24's R30 at the oracle half-peak day
against R30 and T-D at the detector's alarm day, for the 64 injected leaks (arm B) and the new
2019 real leaks (arm A), with the chance expectation.

    python experiments/step26-alarm-timed/figure.py   # writes experiments/step26-alarm-timed/alarm_timed.svg

Reads this step's leaks.tsv.
"""
import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
DET = "D1-L"
BARS = (("R30_or", "R30 at the oracle day"), (f"R30_{DET}", "R30 at the alarm day"), (f"TD_{DET}", "T-D at the alarm day"))


def main():
    with open(HERE / "leaks.tsv") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    groups = [("injected leaks (arm B)", [r for r in rows if r["arm"] == "B"]),
              ("real 2019 leaks (arm A)", [r for r in rows if r["arm"] == "A" and r["year"] == "2019"])]
    fig, ax = plt.subplots(figsize=(7.5, 3.6))
    w = 0.22
    colours = ("#9aa7b8", "#2f6db5", "#7a7a7a")
    for gi, (lab, g) in enumerate(groups):
        det = [r for r in g if int(r[f"k_{DET}"]) >= 0]
        for bi, (key, name) in enumerate(BARS):
            x = gi + (bi - 1) * w
            hits = sum(float(r[key]) <= 300 for r in det)
            ax.bar(x, hits, w, color=colours[bi], label=name if gi == 0 else None)
            ax.text(x, hits + 0.3, str(hits), ha="center", fontsize=7)
        ch = sum(float(r["pi"]) for r in det)
        ax.plot([gi - 1.6 * w, gi + 1.6 * w], [ch, ch], color="#c03030", lw=1.2, ls="--", label="chance" if gi == 0 else None)
        ax.text(gi, -2.2, f"{DET} detects {len(det)} of {len(g)}", ha="center", fontsize=7, color="#555")
    ax.set_xticks(range(len(groups)), [g[0] for g in groups], fontsize=8)
    ax.set_ylabel("detected leaks within 300 m")
    ax.set_ylim(-2.8, None)
    ax.legend(fontsize=7, loc="upper right")
    ax.set_title("L-Town, step 26: localising at the detector's alarm day instead of the oracle hour", fontsize=9)
    fig.tight_layout()
    fig.savefig(HERE / "alarm_timed.svg")


if __name__ == "__main__":
    main()

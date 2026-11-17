"""Figure: each detector's alarms on the real BattLeDIM data and on the leak-free simulation.

    PYTHONPATH=src python experiments/step14-leakfree/figure.py   # writes experiments/step14-leakfree/null_alarms.svg

Reads alarms.tsv (written by run.py) and the leak onsets from the harness.
"""
from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from water_leaks import harness  # noqa: E402

HERE = Path(__file__).resolve().parent
ORDER = ["D1-F", "LILA-auto", "M1", "M2", "M3", "M4"]


def main():
    rows = [ln.split("\t") for ln in (HERE / "alarms.tsv").read_text().splitlines()[1:] if ln]
    S = harness.setup()
    onsets = [e[1].astype("datetime64[h]") for e in S["events"] if e[1] >= np.datetime64("2018-01-15T00", "m")]
    fig, ax = plt.subplots(figsize=(9, 4.2))
    for i, o in enumerate(onsets):
        ax.axvline(o.astype(object), color="#c0392b", lw=0.6, ls="--", alpha=0.6, label="leak onset" if i == 0 else None)
    ticks, labels = [], []
    for j, k in enumerate(ORDER):
        for lab, dy, col, mk in (("real", 0.15, "#2f6db5", "o"), ("null", -0.15, "#d17a22", "x")):
            t = [np.datetime64(r[2], "h").astype(object) for r in rows if r[0] == k and r[1] == lab]
            y = len(ORDER) - j + dy
            ax.plot(t, [y] * len(t), mk, color=col, ms=4,
                    label=("real data" if lab == "real" else "leak-free simulation") if j == 0 else None)
        ticks.append(len(ORDER) - j)
        labels.append(k)
    ax.set_yticks(ticks, labels)
    ax.set_ylim(0.4, len(ORDER) + 1.1)
    ax.set_title("Alarms on BattLeDIM 2018-19 and on the same network with no leaks (L-TOWN_Real.inp)\n"
                 "pressure detectors go quiet; night-flow detectors alarm as often as before", fontsize=10)
    ax.legend(fontsize=8, loc="upper center", ncol=3, framealpha=0.95)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(HERE / "null_alarms.svg")


if __name__ == "__main__":
    main()

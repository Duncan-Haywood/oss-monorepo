"""Figure: where each detector alarms in a leak's life. For every detected leak (both years, real
and injected), the alarm day minus the onset day, split by leak kind, for D2 (step 28, on the
residual D) and D1-L (step 26, on the raw pressures); filled markers are leaks R30 places within
300 m on the alarm day. The grey band per kind spans the quartiles of the oracle half-peak day
(also from onset), where steps 21 to 25 localised.

    python experiments/step28-detector-on-d/figure.py   # writes experiments/step28-detector-on-d/alarm_vs_onset.svg

Reads this step's leaks.tsv and step 26's leaks.tsv (D1-L's R30 at its alarm day).
"""
import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = Path(__file__).resolve().parent


def _rows(path):
    with open(path) as f:
        return list(csv.DictReader(f, delimiter="\t"))


def main():
    rows = _rows(HERE / "leaks.tsv")
    r26 = {(r["arm"], r["id"]): r for r in _rows(HERE.parent / "step26-alarm-timed" / "leaks.tsv")}
    fig, ax = plt.subplots(figsize=(8.5, 3.6))
    lanes = [("abrupt", "D2"), ("abrupt", "D1-L"), ("incipient", "D2"), ("incipient", "D1-L")]
    colors = {"D2": "#2f6db5", "D1-L": "#9a6a2f"}
    rng = np.random.default_rng(0)
    for y, (kind, det) in enumerate(lanes):
        sub = [r for r in rows if r["kind"] == kind]
        orc = np.array([int(r["k_or"]) - int(r["k_on"]) for r in sub])
        q1, q3 = np.percentile(orc, [25, 75])
        ax.fill_betweenx([y - 0.4, y + 0.4], q1 - 0.5, q3 + 0.5, color="#d8d8d8", zorder=0)
        for r in sub:
            k = int(r["k_D2"] if det == "D2" else r["k_D1-L"])
            if k < 0:
                continue
            hit = float(r["L0_D2"]) <= 300 if det == "D2" else float(r26[(r["arm"], r["id"])]["R30_D1-L"]) <= 300
            x = k - int(r["k_on"])
            ax.scatter(x, y + rng.uniform(-0.25, 0.25), s=22, edgecolor=colors[det],
                       facecolor=colors[det] if hit else "none", lw=1.1, zorder=2)
    ax.set_yticks(range(len(lanes)), [f"{k}, {d}" for k, d in lanes], fontsize=8)
    ax.axvline(0, color="#555", lw=0.8)
    ax.set_xlabel("alarm day minus leak onset day (grey: quartiles of the oracle half-peak day)")
    ax.set_title("L-Town, step 28: both detectors alarm days after onset; incipient leaks reach half peak a month later"
                 "\nfilled = R30 within 300 m at the alarm day", fontsize=9)
    fig.tight_layout()
    fig.savefig(HERE / "alarm_vs_onset.svg")


if __name__ == "__main__":
    main()

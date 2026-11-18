"""Figure: SICAMS-auto's standardised T^2_F moving average in 2019, its alarms and the leak onsets.

    PYTHONPATH=src python experiments/step13-sicams/figure.py   # writes experiments/step13-sicams/sicams_2019.svg
"""
from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from water_leaks import harness  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    z = np.load(HERE / "series.npz")
    hrs = z["hours"].astype("datetime64[h]")
    y19 = hrs >= np.datetime64("2019-01-01T00", "h")
    S = harness.setup()
    onsets = [e[1].astype("datetime64[h]") for e in S["events"] if e[1] >= np.datetime64("2019-01-01T00", "m")]
    al = [hrs[t] for t in z["alarms"] if y19[t]]
    fig, ax = plt.subplots(figsize=(9, 3.6))
    ax.plot(hrs[y19].astype(object), z["ma"][y19],
            lw=0.7, color="#2f6db5", label="T$^2_F$, 12 h mean (training sd units), area A")
    for i, o in enumerate(onsets):
        ax.axvline(o.astype(object), color="#c0392b", lw=0.8, ls="--", label="new leak onset" if i == 0 else None)
    top = np.nanmax(z["ma"][y19])
    ax.plot([a.astype(object) for a in al], [top * 1.04] * len(al), "v", color="#d17a22", ms=5,
            label=f"SICAMS-auto alarm ({len(al)})")
    ax.set_ylabel("standardised statistic")
    ax.set_title("SICAMS-auto on BattLeDIM 2019: 13 of 19 leaks found, 26 false alarms as leaks pile up", fontsize=10)
    ax.legend(fontsize=8, loc="upper left")
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(HERE / "sicams_2019.svg")


if __name__ == "__main__":
    main()

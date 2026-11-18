"""Figure: the small 2019 leaks' own night flow over their first 30 days, against the spread of
the best night-flow statistic (M4), and where the pressure detectors were credited with them.

    PYTHONPATH=src python experiments/step7-mnf2/figure.py   # writes experiments/step7-mnf2/small_leaks.svg

Needs the cached BattLeDIM 2019_Leakages.csv (data.py fetches it) and results.txt.
"""
import importlib.util
import re
from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from water_leaks import data, detect  # noqa: E402

HERE = Path(__file__).resolve().parent
SMALL = ["p123", "p193", "p277", "p280", "p331", "p455", "p680", "p710", "p879"]


def main():
    ts, cols, L = data.load("Leakages", 2019)
    hrs, Lh = detect.hourly(ts, L)
    spec = importlib.util.spec_from_file_location("step6", HERE.parent / "step6-mnf" / "run.py")
    s6 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(s6)
    d1 = s6.prior_delays(HERE.parent / "step1-baseline" / "results.txt", "## variant F", "## variant L")
    sd = float(re.search(r"# M4:.*?\n.*?\n\s+14-day robust sd in 2018: median ([\d.]+)",
                         (HERE / "results.txt").read_text(), re.S).group(1))
    fig, ax = plt.subplots(figsize=(8.5, 4.2))
    for p in SMALL:
        j = cols.index(p)
        on = int(np.nonzero(Lh[:, j] > 0)[0][0])
        y = Lh[on: on + 30 * 24, j]
        t = np.arange(len(y)) / 24
        ramp = y[24] < 0.5 * y.max()
        ax.plot(t, y, color="#d17a22" if ramp else "#2f6db5", lw=1.1)
        nudge = {"p710": 6, "p680": 0, "p280": -6, "p193": 4, "p455": -2, "p123": 3, "p277": -4}.get(p, 0)
        ax.annotate(p, (t[-1], y[-1]), fontsize=7, xytext=(3, nudge), textcoords="offset points", va="center")
        if np.isfinite(d1[p]) and d1[p] < len(y):
            k = int(d1[p])
            ax.plot([k / 24], [y[k]], marker="o", color="#c0392b", ms=5, ls="none")
    ax.axhline(sd, color="#555", ls="--", lw=0.9)
    ax.text(8, sd - 0.55, f"M4 (AMR-net, weekday-corrected) night-to-night robust sd, 2018 median: {sd:.1f} m³/h",
            fontsize=7, color="#555")
    from matplotlib.lines import Line2D
    ax.legend(handles=[Line2D([], [], color="#2f6db5", label="abrupt small leak"),
                       Line2D([], [], color="#d17a22", label="incipient ramp"),
                       Line2D([], [], marker="o", color="#c0392b", ls="none",
                              label="where pressure CUSUM D1 was credited (30-day match)")],
              fontsize=7, loc="upper left", frameon=False, bbox_to_anchor=(0, 0.93))
    ax.set_xlabel("days since onset")
    ax.set_ylabel("leak flow, m³/h (hourly mean)")
    ax.set_xlim(0, 33)
    ax.set_title("BattLeDIM 2019, leaks under 12 m³/h: five ramps leak under 2 m³/h for a month; "
                 "D1's hits on them come at 0.02-0.22 m³/h", fontsize=8.5)
    fig.tight_layout()
    fig.savefig(HERE / "small_leaks.svg")


if __name__ == "__main__":
    main()

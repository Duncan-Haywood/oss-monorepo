"""Figure: the nightly minimum flow over 2018-19 with M1's alarms and the 2019 leak onsets.

    python experiments/step6-mnf/figure.py   # writes experiments/step6-mnf/night_flow.svg

Reads night.tsv, alarms.tsv and results.txt (written by run.py); needs no data download.
"""
import re
from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    rows = [ln.split("\t") for ln in (HERE / "night.tsv").read_text().split("\n")[1:] if ln]
    days = np.array([r[0] for r in rows], dtype="datetime64[D]")
    m = np.array([float(r[1]) for r in rows])
    alarms = [ln.split("\t") for ln in (HERE / "alarms.tsv").read_text().split("\n")[1:] if ln.startswith("M1\t")]
    block = (HERE / "results.txt").read_text().split("## M1: h", 1)[1].split("## H4", 1)[0]
    onsets = re.findall(r"^\s+(p\d+) onset (\S+) peak\s+([\d.]+) m3/h\s+(detected|missed)", block, re.M)
    fig, ax = plt.subplots(figsize=(9, 3.8))
    ax.plot(days, m, color="#2f6db5", lw=0.9, label="nightly minimum of district inflow (00:00-06:00)")
    first = True
    for a in alarms:
        t = np.datetime64(a[2][:10], "D")
        hit = bool(a[3])
        ax.axvline(t, color="#2a9d55" if hit else "#c0392b", lw=0.8, ls="-" if hit else ":",
                   label=None)
    for pipe, on, peak, status in onsets:
        t = np.datetime64(on[:10], "D")
        small = float(peak) < 12
        ax.plot([t], [20], marker="^", ms=6 if small else 8,
                color="#d17a22" if small else "#6b4c9a", mfc="none" if status == "missed" else None,
                ls="none", label=None)
    from matplotlib.lines import Line2D
    handles = [Line2D([], [], color="#2f6db5", lw=0.9, label="nightly minimum flow, m³/h"),
               Line2D([], [], color="#2a9d55", lw=0.8, label="M1 alarm in 2019, matched to a leak"),
               Line2D([], [], color="#c0392b", lw=0.8, ls=":", label="M1 false alarm in 2019"),
               Line2D([], [], marker="^", color="#d17a22", ls="none", label="2019 onset, peak < 12 m³/h (open: missed)"),
               Line2D([], [], marker="^", color="#6b4c9a", ls="none", ms=8, label="2019 onset, peak ≥ 12 m³/h")]
    ax.legend(handles=handles, fontsize=7, loc="upper left", frameon=False)
    ax.set_ylabel("m³/h")
    ax.set_ylim(0, max(m) * 1.05)
    ax.set_title("BattLeDIM L-Town: the night-to-night spread (robust sd ≈ 11 m³/h) is as large as the incipient leaks", fontsize=9)
    fig.tight_layout()
    fig.savefig(HERE / "night_flow.svg")


if __name__ == "__main__":
    main()

"""Figure: D1 (step 1) and automatic LILA (step 2) against chance on the 2019 new leaks.

    python experiments/step2-lila/figure.py   # writes experiments/step2-lila/lila_vs_chance.svg
"""
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
LABEL = {"TP": "detected\n(30-day window)", "FP": "false alarms", "TP<=72h": "detected\nwithin 72 h",
         "TP<=300m": "alarming sensor\n<= 300 m from leak", "TP<=72h&300m": "both"}


def rows(block):
    return re.findall(r"^\s+(TP\S*|FP)\s+(\d+)\s+(\d+) \((\d+) to (\d+)\)\s+([\d.]+)", block, re.M)


def main():
    d1 = rows((HERE.parent / "step1-baseline" / "results.txt").read_text().split("## variant F")[1].split("## variant")[0])
    li = rows((HERE / "results.txt").read_text().split("## LILA-auto, MAS ties by index")[1].split("# H1 check")[0])
    names = [r[0] for r in li]
    fig, ax = plt.subplots(figsize=(8, 3.8))
    x = range(len(names))
    w = 0.27
    ax.bar([i - w for i in x], [int(r[1]) for r in d1], w, label="D1 residual CUSUM (step 1), 26 alarms", color="#2f6db5")
    ax.bar(list(x), [int(r[1]) for r in li], w, label="LILA, automatic (step 2), 26 alarms", color="#d17a22")
    med = [int(r[2]) for r in li]
    ax.bar([i + w for i in x], med, w, yerr=[[m - int(r[3]) for m, r in zip(med, li)], [int(r[4]) - m for m, r in zip(med, li)]],
           capsize=3, color="#b9b9b9", label="26 random alarms (median, 95% range)")
    for i, r in enumerate(li):
        pv = float(r[5])
        ax.text(i, int(r[1]) + 0.4, "LILA P<0.001" if pv < 0.001 else f"LILA P={pv:.3f}", ha="center", fontsize=7)
    ax.set_xticks(list(x))
    ax.set_xticklabels([LABEL[n] for n in names], fontsize=8)
    ax.set_ylabel("2019 leaks (of 19 new)")
    ax.set_title("BattLeDIM 2019, both tuned on 2018: counts sit at the edge of chance; location is far above it", fontsize=9)
    ax.legend(fontsize=7.5, frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(HERE / "lila_vs_chance.svg")


if __name__ == "__main__":
    main()

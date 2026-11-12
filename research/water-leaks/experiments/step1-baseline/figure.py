"""Figure: D1 against chance on the 2019 new leaks, from results.txt (variant F).

    python experiments/step1-baseline/figure.py   # writes experiments/step1-baseline/chance.svg
"""
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
LABEL = {"TP": "detected\n(30-day window)", "FP": "false alarms", "TP<=72h": "detected\nwithin 72 h",
         "TP<=300m": "alarming sensor\n<= 300 m from leak", "TP<=72h&300m": "both"}


def main():
    text = (HERE / "results.txt").read_text()
    block = text.split("## variant F")[1].split("## variant")[0]
    rows = re.findall(r"^\s+(TP\S*|FP)\s+(\d+)\s+(\d+) \((\d+) to (\d+)\)", block, re.M)
    names = [r[0] for r in rows]
    d1 = [int(r[1]) for r in rows]
    med = [int(r[2]) for r in rows]
    lo = [int(r[2]) - int(r[3]) for r in rows]
    hi = [int(r[4]) - int(r[2]) for r in rows]
    fig, ax = plt.subplots(figsize=(7.5, 3.6))
    x = range(len(names))
    ax.bar([i - 0.2 for i in x], d1, 0.4, label="D1 (tuned on 2018)", color="#2f6db5")
    ax.bar([i + 0.2 for i in x], med, 0.4, yerr=[lo, hi], capsize=3, color="#b9b9b9",
           label="random alarms, same count (median, 95% range)")
    ax.set_xticks(list(x))
    ax.set_xticklabels([LABEL[n] for n in names], fontsize=8)
    ax.set_ylabel("2019 leaks (of 19 new)")
    ax.set_title("BattLeDIM 2019: detection counts alone are near chance; location is not", fontsize=10)
    ax.legend(fontsize=8, frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(HERE / "chance.svg")


if __name__ == "__main__":
    main()

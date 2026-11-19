"""Figure: share of the leaks D1-L detects that each of step 27's 17 re-timed rules places within
300 m, on the 2018 tuning leaks and the 2019 test leaks, with R30 at the oracle half-peak day per
year as dashed lines and the rule selected on 2018 marked.

    python experiments/step27-retimed/figure.py   # writes experiments/step27-retimed/retimed.svg

Reads this step's rules.tsv, leaks.tsv and results.txt (for the selected rule).
"""
import csv
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    with open(HERE / "rules.tsv") as f:
        rules = list(csv.DictReader(f, delimiter="\t"))
    with open(HERE / "leaks.tsv") as f:
        leaks = list(csv.DictReader(f, delimiter="\t"))
    sel = re.search(r"^  S = (\S+),", (HERE / "results.txt").read_text(), re.M).group(1)
    fig, ax = plt.subplots(figsize=(8.5, 3.8))
    w = 0.38
    series = (("2018", "#9aa7b8", "2018 (tuning)"), ("2019", "#2f6db5", "2019 (test)"))
    for si, (yr, col, lab) in enumerate(series):
        n = int(rules[0][f"n_{yr}"])
        xs = [i + (si - 0.5) * w for i in range(len(rules))]
        ys = [int(r[f"hits_{yr}"]) / n for r in rules]
        ax.bar(xs, ys, w, color=col, label=f"{lab}, n = {n}")
        orc = sum(float(r["R30_or"]) <= 300 for r in leaks if r["year"] == yr) / n
        ax.axhline(orc, color=col, ls="--", lw=1.1)
        ax.text(len(rules) - 0.4, orc + 0.01, f"oracle day {yr}", fontsize=7, color=col, ha="right")
    names = [r["rule"] for r in rules]
    ax.set_xticks(range(len(rules)), names, rotation=60, fontsize=7)
    for t in ax.get_xticklabels():
        if t.get_text() == sel:
            t.set_fontweight("bold")
            t.set_color("#c03030")
    ax.set_ylabel("detected leaks within 300 m (share)")
    ax.set_title(f"L-Town, step 27: R30 re-timed to D1-L's alarm (selected on 2018: {sel}, in red)", fontsize=9)
    ax.legend(fontsize=7, loc="upper left")
    fig.tight_layout()
    fig.savefig(HERE / "retimed.svg")


if __name__ == "__main__":
    main()

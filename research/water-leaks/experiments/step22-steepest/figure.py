"""Figure: leaks within 300 m by estimate on the demand-oracle residual, abrupt and incipient.

    python experiments/step22-steepest/figure.py   # writes experiments/step22-steepest/steepest.svg

Reads this step's results.txt.
"""
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
PAT = re.compile(r"^\s+(.+?)\s+(\d+) of 32 .*abrupt (\d+) of 15, incipient (\d+) of 17")


def main():
    res = {}
    for ln in (HERE / "results.txt").read_text().splitlines():
        m = PAT.match(ln)
        if m:
            res.setdefault(m.group(1), tuple(int(g) for g in m.groups()[1:]))
    bars = [("steepest rise,\ndated <= 30 d", "S30, primary", "#2f6db5"),
            ("latest onset\n(step 21)", "ref: T-D latest onset (step 21)", "#6f9ad6"),
            ("largest flow,\ndated <= 30 d", "F30 (largest flow, onset within 30 days)", "#999"),
            ("steepest rise,\nany onset", "Sall (no onset limit)", "#999"),
            ("D1 regression\n(step 11)", "ref: A on D1 regression (step 11)", "#bbb"),
            ("one-leak oracle\n(step 17)", "ref: one-leak oracle (step 17)", "#d17a22")]
    fig, ax = plt.subplots(figsize=(8, 4.2))
    xs = range(len(bars))
    ab = [res[b[1]][1] for b in bars]
    inc = [res[b[1]][2] for b in bars]
    ax.bar(xs, ab, color=[b[2] for b in bars], label="abrupt (of 15)")
    ax.bar(xs, inc, bottom=ab, color=[b[2] for b in bars], hatch="//", edgecolor="white", label="incipient (of 17)")
    for x, a, i in zip(xs, ab, inc):
        ax.text(x, a + i + 0.4, f"{a}+{i}", ha="center", fontsize=8)
    ax.set_xticks(list(xs), [b[0] for b in bars], fontsize=7)
    ax.set_ylim(0, 32)
    ax.set_ylabel("leaks within 300 m, of 32 (chance 1.4)")
    ax.legend(fontsize=7, loc="upper left")
    ax.set_title(f"L-Town, demand-oracle residual: the steepest-rising dated source finds {res['S30, primary'][0]} of 32"
                 " (abrupt + incipient)", fontsize=9)
    fig.tight_layout()
    fig.savefig(HERE / "steepest.svg")


if __name__ == "__main__":
    main()

"""Figure: leaks within 300 m by estimate, and the tracker's active-atom count over 2018-19.

    python experiments/step20-tracker/figure.py   # writes experiments/step20-tracker/tracker.svg

Reads this step's results.txt (hits per estimate, abrupt and incipient apart) and daily.tsv (active
atoms per day under the primary tracker).
"""
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
PAT = re.compile(r"^\s+(.+?)\s+\d+ of 32 .*abrupt (\d+) of 15, incipient (\d+) of 17")


def main():
    res = {}
    for ln in (HERE / "results.txt").read_text().splitlines():
        m = PAT.match(ln)
        if m:
            res.setdefault(m.group(1), (int(m.group(2)), int(m.group(3))))
    bars = [("tracker,\nlatest onset", "T, primary", "#2f6db5"),
            ("tracker,\noracle onset", "T-on (oracle onset)", "#6f9ad6"),
            ("two-window rise,\nsame residual", "J on F (step 19's rule, same residual)", "#999"),
            ("lagged difference\n(step 18)", "ref: A on P-lag(168) (step 18, data only)", "#bbb"),
            ("D1 regression\n(step 11)", "ref: A on D1 regression (step 11)", "#bbb"),
            ("one-leak oracle\n(step 17)", "ref: one-leak oracle (step 17)", "#d17a22")]
    rows = [ln.split("\t") for ln in (HERE / "daily.tsv").read_text().splitlines()[1:]]
    day = [int(r[0]) for r in rows]
    act = [int(r[1]) for r in rows]
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), gridspec_kw={"width_ratios": [1.2, 1]})
    ax = axes[0]
    xs = range(len(bars))
    ab = [res[b[1]][0] for b in bars]
    inc = [res[b[1]][1] for b in bars]
    ax.bar(xs, ab, color=[b[2] for b in bars], label="abrupt (of 15)")
    ax.bar(xs, inc, bottom=ab, color=[b[2] for b in bars], hatch="//", edgecolor="white", label="incipient (of 17)")
    ax.set_xticks(list(xs), [b[0] for b in bars], fontsize=7)
    ax.set_ylim(0, 32)
    ax.set_ylabel("leaks within 300 m, of 32 (chance 1.4)")
    ax.legend(fontsize=7, loc="upper left")
    ax.set_title("localisation (hatched: incipient)", fontsize=10)
    ax = axes[1]
    ax.plot(day, act, color="#2f6db5", lw=0.8)
    ax.axhline(24, color="#c33", ls="--", lw=1, label="atom cap (24)")
    ax.set_xlabel("day from 2018-01-01")
    ax.set_ylabel("active atoms (flow >= 0.5 m3/h)")
    ax.set_ylim(0, 26)
    ax.legend(fontsize=7, loc="lower right")
    ax.set_title("the daily tracker accumulates atoms", fontsize=10)
    fig.suptitle("L-Town, data-only residual: dating fitted sources by onset localises 8 of 32 leaks", fontsize=10)
    fig.tight_layout()
    fig.savefig(HERE / "tracker.svg")


if __name__ == "__main__":
    main()

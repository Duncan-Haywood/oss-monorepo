"""Figure: leaks within 300 m by estimate, and active atoms per day on D (this step) against F (step 20).

    python experiments/step21-tracker-d/figure.py   # writes experiments/step21-tracker-d/tracker_d.svg

Reads this step's results.txt and daily.tsv, and step 20's daily.tsv.
"""
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
PAT = re.compile(r"^\s+(.+?)\s+(\d+) of 32 .*abrupt (\d+) of 15, incipient (\d+) of 17")


def _daily(path):
    rows = [ln.split("\t") for ln in path.read_text().splitlines()[1:]]
    return [int(r[0]) for r in rows], [int(r[1]) for r in rows]


def main():
    res = {}
    for ln in (HERE / "results.txt").read_text().splitlines():
        m = PAT.match(ln)
        if m:
            res.setdefault(m.group(1), tuple(int(g) for g in m.groups()[1:]))
    bars = [("tracker on D,\nlatest onset", "T-D, primary", "#2f6db5"),
            ("tracker on D,\noracle onset", "T-D-on (oracle onset)", "#6f9ad6"),
            ("tracker on F\n(step 20)", "ref: T on F (step 20, data only)", "#999"),
            ("two-window rise\non D (step 19)", "ref: J-lag(168) on D (step 19)", "#bbb"),
            ("D1 regression\n(step 11)", "ref: A on D1 regression (step 11)", "#bbb"),
            ("one-leak oracle\n(step 17)", "ref: one-leak oracle (step 17)", "#d17a22")]
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), gridspec_kw={"width_ratios": [1.2, 1]})
    ax = axes[0]
    xs = range(len(bars))
    ab = [res[b[1]][1] for b in bars]
    inc = [res[b[1]][2] for b in bars]
    ax.bar(xs, ab, color=[b[2] for b in bars], label="abrupt (of 15)")
    ax.bar(xs, inc, bottom=ab, color=[b[2] for b in bars], hatch="//", edgecolor="white", label="incipient (of 17)")
    ax.set_xticks(list(xs), [b[0] for b in bars], fontsize=7)
    ax.set_ylim(0, 32)
    ax.set_ylabel("leaks within 300 m, of 32 (chance 1.4)")
    ax.legend(fontsize=7, loc="upper left")
    ax.set_title("localisation (hatched: incipient)", fontsize=10)
    ax = axes[1]
    dD, aD = _daily(HERE / "daily.tsv")
    dF, aF = _daily(HERE.parent / "step20-tracker" / "daily.tsv")
    ax.plot(dF, aF, color="#999", lw=0.7, label="data-only F (step 20)")
    ax.plot(dD, aD, color="#2f6db5", lw=0.8, label="demand-oracle D (this step)")
    ax.axhline(24, color="#c33", ls="--", lw=1, label="atom cap (24)")
    ax.set_xlabel("day from 2018-01-01")
    ax.set_ylabel("active atoms (flow >= 0.5 m3/h)")
    ax.set_ylim(0, 26)
    ax.legend(fontsize=7, loc="lower right")
    ax.set_title("active atoms per day, by residual", fontsize=10)
    fig.suptitle(f"L-Town: the daily tracker on the demand-oracle residual localises {res['T-D, primary'][0]} of 32 leaks"
                 f" (data-only residual: {res['ref: T on F (step 20, data only)'][0]})", fontsize=10)
    fig.tight_layout()
    fig.savefig(HERE / "tracker_d.svg")


if __name__ == "__main__":
    main()

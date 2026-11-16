"""Figure: leaks within 300 m by residual and estimate, abrupt and incipient leaks apart.

    python experiments/step19-joint/figure.py   # writes experiments/step19-joint/methods.svg

Reads this step's results.txt: the joint fit (J-lag(168), J-on), the references from steps 11, 15, 17
and 18, and the post-hoc count of leaks with any fitted atom within 300 m, with its chance level.
"""
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
PAT = re.compile(r"^\s+(.+?)\s+\d+ of 32 .*abrupt (\d+) of 15, incipient (\d+) of 17")
SET = re.compile(r"^\s+(abrupt|incipient)\s*: an atom within 300 m of the target (\d+) of \d+;.*expected ([\d.]+)")


def main():
    res, setc = {}, {}
    for ln in (HERE / "results.txt").read_text().splitlines():
        m = PAT.match(ln)
        if m:
            res.setdefault(m.group(1), (int(m.group(2)), int(m.group(3))))
        m = SET.match(ln)
        if m:
            setc[m.group(1)] = (int(m.group(2)), float(m.group(3)))
    bars = [("lagged difference\n(step 18)", "ref: A on D-lag(168) (step 18)", "#999"),
            ("D1 regression\n(step 11)", "ref: A on D1 regression (step 11)", "#999"),
            ("joint fit, rise\nvs 168 h (this step)", "J-lag(168), primary", "#2f6db5"),
            ("joint fit, rise\nvs onset (oracle)", "J-on (onset baseline, oracle onset)", "#6f9ad6"),
            ("one-leak oracle\n(step 17)", "ref: A on one-leak oracle (step 17)", "#d17a22")]
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    for ax, k, n, key, lab in ((axes[0], 0, 15, "abrupt", "abrupt leaks (15)"),
                               (axes[1], 1, 17, "incipient", "incipient leaks (17)")):
        xs = range(len(bars))
        ax.bar(xs, [res[b[1]][k] for b in bars], color=[b[2] for b in bars])
        found, exp = setc[key]
        ax.axhline(found, color="#2f6db5", ls="--", lw=1, label=f"joint fit has an atom within 300 m ({found})")
        ax.axhline(exp, color="#2f6db5", ls=":", lw=1, label=f"same, atoms drawn at random ({exp:.1f})")
        ax.set_xticks(list(xs), [b[0] for b in bars], fontsize=7)
        ax.set_ylim(0, n)
        ax.set_ylabel("within 300 m")
        ax.set_title(lab, fontsize=10)
        ax.legend(fontsize=7, loc="upper left", framealpha=0.95)
    fig.suptitle("L-Town: a joint fit finds slow leaks in its atom set but the largest-rise rule does not pick them", fontsize=10)
    fig.tight_layout()
    fig.savefig(HERE / "methods.svg")


if __name__ == "__main__":
    main()

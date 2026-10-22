"""results.json -> figure.png: pass rate of each published skill file on plants A, B (numpy) and C (MuJoCo)."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = Path(__file__).resolve().parent
ORDER = [("cohold-follow-nominal", "hand-set\n(cohold)"), ("cohold-follow-A", "trained on\nrigid A only"),
         ("cohold-follow-B", "trained on\nflexing B"), ("cohold-follow-mixed", "trained on\nA and B mixed")]


def main():
    res = json.loads((HERE / "results.json").read_text())["rescored"]
    fig, ax = plt.subplots(figsize=(8.5, 4.4), constrained_layout=True)
    x = np.arange(len(ORDER))
    for off, plant, col, lab in ((-0.27, "A", "tab:blue", "A: rigid sheet (numpy)"), (0.0, "B", "tab:red", "B: flexing sheet, delay, lag (numpy)"),
                                 (0.27, "C", "tab:green", "C: same as B in MuJoCo (first 200 worlds)")):
        v = [res[k][plant]["success"] for k, _ in ORDER]
        ax.bar(x + off, v, 0.26, color=col, alpha=0.85, label=lab)
        for xi, vi in zip(x + off, v):
            ax.text(xi, vi + 0.012, "%.0f" % (100 * vi), ha="center", fontsize=7)
    ax.set_xticks(x)
    ax.set_xticklabels([n for _, n in ORDER], fontsize=8)
    ax.set_ylim(0, 1)
    ax.set_ylabel("share of episodes passing")
    ax.set_title("Skill files reloaded from disk and re-scored (1000 episodes on A and B)", fontsize=9)
    ax.legend(fontsize=7.5, loc="upper left")
    ax.grid(axis="y", alpha=0.3)
    fig.savefig(HERE / "figure.png", dpi=130)


if __name__ == "__main__":
    main()

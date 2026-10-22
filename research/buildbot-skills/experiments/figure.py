"""results.json -> figure.png: test success of each trained skill on the training plant and the held-out plant, and where B fails."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = Path(__file__).resolve().parent
NAMES = [("cohold_nominal", "cohold\nnominal"), ("A_nominal", "trained on one\nnominal case (A)"),
         ("A_random", "trained on\nrandomised A"), ("B_random", "trained on\nrandomised B\n(reference)")]


def main():
    res = json.loads((HERE / "results.json").read_text())
    fig, (a, b) = plt.subplots(1, 2, figsize=(12, 4.4), constrained_layout=True)
    x = np.arange(len(NAMES))
    for off, plant, col in ((-0.2, "A", "tab:blue"), (0.2, "B", "tab:red")):
        for i, (key, _) in enumerate(NAMES):
            v = [r["test"][plant]["success"] for r in res["rows"] if r["policy"] == key]
            a.bar(i + off, np.mean(v), 0.38, color=col, alpha=0.8, label=("rigid sheet (A), the training plant" if plant == "A" else "flexing sheet, delay, lag (B), held out") if i == 0 else None)
            a.plot([i + off] * len(v), v, "k.", ms=4)
    a.set_xticks(x)
    a.set_xticklabels([n for _, n in NAMES], fontsize=8)
    a.set_ylabel("share of fresh episodes passing")
    a.set_ylim(0, 1)
    a.set_title("Success on 1000 fresh episodes per plant (bars: mean over seeds, dots: seeds)", fontsize=9)
    a.legend(fontsize=8, loc="upper left")
    a.grid(axis="y", alpha=0.3)
    for label, col in (("feedback delay s", "tab:purple"), ("flex stiffness N m/rad", "tab:green"), ("sheet kg", "tab:orange"), ("lag s", "tab:red")):
        rows = res["diagnostics"]["B_random"]["bins"][label]
        b.plot(range(len(rows)), [r["success"] for r in rows], "o-", color=col, label=label)
    b.set_xticks(range(3))
    b.set_xticklabels(["low third of range", "middle", "top third"], fontsize=8)
    b.set_ylim(0, 1)
    b.set_ylabel("success on plant B")
    b.set_title("Plant-B success of the B-trained skill (best seed), by condition", fontsize=9)
    b.legend(fontsize=8)
    b.grid(alpha=0.3)
    fig.savefig(HERE / "figure.png", dpi=110)


if __name__ == "__main__":
    main()

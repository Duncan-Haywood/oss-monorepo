"""Figure: localisation error per leak on step 15's O-inc (step 16) and on the per-leak residual O-one.

    PYTHONPATH=src python experiments/step17-replay/figure.py   # writes experiments/step17-replay/localisation_error.svg

Reads this step's leaks.tsv and step 16's. Both series use step 16's real-day signatures (R);
filled markers are abrupt leaks, open markers incipient ones.
"""
from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent


def rows(path):
    lines = path.read_text().splitlines()
    head = lines[0].split("\t")
    return {r["pipe"]: r for r in (dict(zip(head, ln.split("\t"))) for ln in lines[1:] if ln)}


def main():
    r17 = rows(HERE / "leaks.tsv")
    r16 = rows(HERE.parent / "step16-realday" / "leaks.tsv")
    pipes = sorted(r17, key=lambda p: (r17[p]["kind"], float(r17[p]["err_R"])))
    fig, ax = plt.subplots(figsize=(9, 4.2))
    x = np.arange(len(pipes))
    for vals, lab, col, mk in (([float(r16[p]["err_R_oinc"]) for p in pipes], "O-inc, every other leak's change in it (step 16)", "#2f6db5", "o"),
                               ([float(r17[p]["err_R"]) for p in pipes], "O-one, the other leaks replayed out (step 17)", "#d17a22", "s")):
        y = np.maximum(vals, 1.0)
        inc = np.array([r17[p]["kind"] == "incipient" for p in pipes])
        hit = int(np.sum(y <= 300))
        ax.plot(x[~inc], y[~inc], mk, color=col, ms=5, label=f"{lab}: {hit} of {len(pipes)} within 300 m")
        ax.plot(x[inc], y[inc], mk, color=col, ms=5, mfc="none")
    ax.axhline(300, color="#888", lw=0.8, ls="--")
    k = sum(r17[p]["kind"] == "abrupt" for p in pipes)
    ax.axvline(k - 0.5, color="#bbb", lw=0.8)
    ax.text(k / 2, 1.3, "abrupt (filled)", ha="center", fontsize=8, color="#555")
    ax.text(k + (len(pipes) - k) / 2, 1.3, "incipient (open)", ha="center", fontsize=8, color="#555")
    ax.set_yscale("log")
    ax.set_xticks(x, pipes, rotation=90, fontsize=7)
    ax.set_ylabel("along-pipe error to the leak pipe (m)")
    ax.set_title("L-Town, 32 leaks, generator's model on each leak's day: localisation error\n"
                 "with and without the other leaks' changes in the residual", fontsize=10)
    ax.legend(fontsize=8, loc="upper left", framealpha=0.95)
    fig.tight_layout()
    fig.savefig(HERE / "localisation_error.svg")


if __name__ == "__main__":
    main()

"""Figure: localisation error per leak, step 11's D1 residual against the oracle residual.

    PYTHONPATH=src python experiments/step15-oracle/figure.py   # writes experiments/step15-oracle/localisation_error.svg

Reads leaks.tsv (written by run.py).
"""
from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
SERIES = [("err_A_d1", "nominal model, D1 residual (step 11)", "#2f6db5", "o"),
          ("err_A_oinc", "nominal model, oracle residual", "#d17a22", "s"),
          ("err_M_oinc", "most-affected sensor, oracle residual", "#5a8f3a", "^")]


def main():
    lines = (HERE / "leaks.tsv").read_text().splitlines()
    head = lines[0].split("\t")
    rows = [dict(zip(head, ln.split("\t"))) for ln in lines[1:] if ln]
    order = np.argsort([float(r["err_A_oinc"]) for r in rows])
    fig, ax = plt.subplots(figsize=(9, 4.2))
    x = np.arange(len(rows))
    for k, lab, col, mk in SERIES:
        y = [max(float(rows[i][k]), 1.0) for i in order]
        hit = sum(v <= 300 for v in y)
        ax.plot(x, y, mk, color=col, ms=5, label=f"{lab}: {hit} of {len(rows)} within 300 m")
    ax.axhline(300, color="#888", lw=0.8, ls="--")
    ax.set_yscale("log")
    ax.set_xticks(x, [rows[i]["pipe"] for i in order], rotation=90, fontsize=7)
    ax.set_ylabel("along-pipe error to the leak pipe (m)")
    ax.set_title("L-Town, 32 leaks at half-peak flow: localisation error with a perfect residual\n"
                 "(published minus leak-free L-TOWN_Real.inp) against step 11's regression residual", fontsize=10)
    ax.legend(fontsize=8, loc="upper left", framealpha=0.95)
    fig.tight_layout()
    fig.savefig(HERE / "localisation_error.svg")


if __name__ == "__main__":
    main()

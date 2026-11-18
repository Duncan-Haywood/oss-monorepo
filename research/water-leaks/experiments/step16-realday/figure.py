"""Figure: localisation error per leak with the nominal model and with the generator's model on the leak's day.

    PYTHONPATH=src python experiments/step16-realday/figure.py   # writes experiments/step16-realday/localisation_error.svg

Reads leaks.tsv (written by run.py). Every series uses step 15's oracle residual o-inc.
"""
from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
SERIES = [("err_A_oinc", "nominal L-TOWN.inp, first day (step 15)", "#2f6db5", "o"),
          ("err_M_oinc", "most-affected sensor (step 15)", "#5a8f3a", "^"),
          ("err_R_oinc", "L-TOWN_Real.inp on the leak's day", "#d17a22", "s")]


def main():
    lines = (HERE / "leaks.tsv").read_text().splitlines()
    head = lines[0].split("\t")
    rows = [dict(zip(head, ln.split("\t"))) for ln in lines[1:] if ln]
    order = np.argsort([float(r["err_R_oinc"]) for r in rows], kind="stable")
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
    ax.set_title("L-Town, 32 leaks, oracle residual: localisation error with the nominal model\n"
                 "and with the generator's own model restarted on each leak's day", fontsize=10)
    ax.legend(fontsize=8, loc="upper left", framealpha=0.95)
    fig.tight_layout()
    fig.savefig(HERE / "localisation_error.svg")


if __name__ == "__main__":
    main()

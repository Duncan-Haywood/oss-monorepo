"""Write experiments/step12-timesize/localisation_error.svg: cumulative share of the 32 oracle-timed
leaks localised within a distance, for step 12's four signature variants and the most-affected sensor.

    python experiments/step12-timesize/figure.py   # from research/water-leaks; reads leaks.tsv
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
CURVES = [("err_A_m", "A: 24 h mean, q = 5 (step 11)", "#c0392b", "-"),
          ("err_B_m", "B: time-resolved, q = 5", "#e67e22", "--"),
          ("err_C_m", "C: 24 h mean, q from flow balance", "#8e44ad", "-."),
          ("err_D_m", "D: time-resolved, q from flow balance (primary)", "#16a085", ":"),
          ("err_mas_m", "most-affected sensor (no model)", "#1f4e79", "-")]


def main():
    lines = (HERE / "leaks.tsv").read_text().splitlines()
    head = lines[0].split("\t")
    rows = [dict(zip(head, ln.split("\t"))) for ln in lines[1:] if ln.startswith("oracle")]
    fig, ax = plt.subplots(figsize=(6.4, 3.9))
    for key, label, colour, ls in CURVES:
        d = sorted(float(r[key]) for r in rows)
        ax.step([0] + d, [0] + [(i + 1) / len(d) for i in range(len(d))], where="post", label=label,
                color=colour, ls=ls, lw=1.6 if key in ("err_A_m", "err_D_m", "err_mas_m") else 1.1)
    pc = sum(float(r["p_chance"]) for r in rows) / len(rows)
    ax.plot([300], [pc], "o", color="0.4", label=f"random junction at 300 m ({100 * pc:.0f}%)")
    ax.axvline(300, color="0.7", ls=":", lw=1)
    ax.set_xlabel("along-pipe distance from estimate to leak pipe (m)")
    ax.set_ylabel(f"share of {len(rows)} leaks")
    ax.set_xlim(0, 3200)
    ax.set_ylim(0, 1)
    ax.set_title("L-Town 2018-19, leaks at half-peak flow: richer signatures do not help", fontsize=10)
    ax.legend(fontsize=7.5, loc="lower right")
    fig.tight_layout()
    fig.savefig(HERE / "localisation_error.svg")


if __name__ == "__main__":
    main()

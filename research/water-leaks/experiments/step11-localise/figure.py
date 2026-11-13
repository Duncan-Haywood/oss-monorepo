"""Write experiments/step11-localise/localisation_error.svg: cumulative share of leaks localised
within a distance, oracle-timed (32 leaks), for the model, the most-affected sensor and chance.

    python experiments/step11-localise/figure.py   # from research/water-leaks; reads leaks.tsv

The chance curve is the expected share of junctions within each distance of the leak pipe, which
needs the network; it is drawn only at 300 m (from leaks.tsv's p_chance column).
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    lines = (HERE / "leaks.tsv").read_text().splitlines()
    head = lines[0].split("\t")
    rows = [dict(zip(head, ln.split("\t"))) for ln in lines[1:] if ln.startswith("oracle")]
    fig, ax = plt.subplots(figsize=(6.4, 3.8))
    for key, label, colour in (("err_pearson_m", "nominal-model sensitivity (Pearson)", "#c0392b"),
                               ("err_mas_m", "most-affected sensor (no model)", "#1f4e79")):
        d = sorted(float(r[key]) for r in rows)
        ax.step([0] + d, [0] + [(i + 1) / len(d) for i in range(len(d))], where="post", label=label, color=colour)
    pc = sum(float(r["p_chance"]) for r in rows) / len(rows)
    ax.plot([300], [pc], "o", color="0.4", label=f"random junction at 300 m ({100 * pc:.0f}%)")
    ax.axvline(300, color="0.7", ls=":", lw=1)
    ax.set_xlabel("along-pipe distance from estimate to leak pipe (m)")
    ax.set_ylabel(f"share of {len(rows)} leaks")
    ax.set_xlim(0, 3200)
    ax.set_ylim(0, 1)
    ax.set_title("BattLeDIM L-Town: localisation error, 2018-19 leaks at half-peak flow", fontsize=10)
    ax.legend(fontsize=8, loc="lower right")
    fig.tight_layout()
    fig.savefig(HERE / "localisation_error.svg")


if __name__ == "__main__":
    main()

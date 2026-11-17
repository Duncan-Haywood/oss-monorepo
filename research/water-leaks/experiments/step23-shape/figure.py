"""Figure: for each leak with a dated source within 300 m, that source's fitted change time minus
the alarm, by leak type and fitted shape.

    python experiments/step23-shape/figure.py   # writes experiments/step23-shape/shape_timing.svg

Reads this step's leaks.tsv.
"""
import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    with open(HERE / "leaks.tsv") as f:
        rows = [r for r in csv.DictReader(f, delimiter="\t") if r["near_shape"] != "-"]
    fig, ax = plt.subplots(figsize=(8, 3.6))
    for y, kind in ((1, "abrupt"), (0, "incipient")):
        for r in rows:
            if r["kind"] != kind:
                continue
            hit = float(r["C30"]) <= 300
            mk = "s" if r["near_shape"] == "step" else "^"
            ax.scatter(float(r["near_dt"]), y + (0.12 if hit else -0.12), marker=mk, s=40,
                       color="#2f6db5" if hit else "#d17a22")
    ax.axvline(0, color="#888", lw=0.8)
    ax.set_yticks([0, 1], ["slow (incipient)", "burst (abrupt)"])
    ax.set_ylim(-0.6, 2.1)
    ax.set_xlabel("the near source's fitted change time minus the alarm, days (step: start; ramp: half level)")
    ax.scatter([], [], marker="s", color="#555", label="fitted step")
    ax.scatter([], [], marker="^", color="#555", label="fitted ramp")
    ax.scatter([], [], marker="o", color="#2f6db5", label="C30 within 300 m")
    ax.scatter([], [], marker="o", color="#d17a22", label="C30 missed")
    ax.legend(fontsize=7, loc="upper left", ncol=2)
    ax.set_title("L-Town, step 23: slow leaks' sources are ramps, but timed days before the alarm, so a newer step wins",
                 fontsize=9)
    fig.tight_layout()
    fig.savefig(HERE / "shape_timing.svg")


if __name__ == "__main__":
    main()

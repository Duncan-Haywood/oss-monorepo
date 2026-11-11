"""Draw validate_data.svg from validate_data.json: measured voltage against SPM, SPMe and DFN at each cell's
highest rate (Ecker 5C, Ai 2C), isothermal, on the finest mesh that was run.

  python experiments/validate_figure.py
"""
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
STYLE = {"SPM": dict(color="#999999", ls=":"), "SPMe": dict(color="#d95f02", ls="--"), "DFN": dict(color="#1b9e77", ls="-")}


def pick(rows, cell, crate):
    cand = [r for r in rows if r["cell"] == cell and r["crate"] == crate and not r["thermal"]]
    return max(cand, key=lambda r: r["mesh"])


def main():
    rows = json.loads((HERE / "validate_data.json").read_text())
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    for ax, (cell, crate, title) in zip(axes, [("Ecker", 5.0, "Kokam 7.5 Ah (Ecker 2015), 5C"),
                                               ("Ai", 2.0, "Enertech 2.28 Ah (Ai 2020), 2C")]):
        r = pick(rows, cell, crate)
        t, v = zip(*r["data_curve"])
        ax.plot(t, v, "o", ms=3, color="black", label="measured")
        for m, st in STYLE.items():
            tm, vm = zip(*r[m]["curve"])
            ax.plot(tm, vm, lw=1.6, label=f"{m} ({r[m]['rmse_mV']:.0f} mV RMSE)", **st)
        ax.set_title(f"{title}, mesh {r['mesh']}x, isothermal", fontsize=10)
        ax.set_xlabel("time [s]")
        ax.set_ylabel("voltage [V]")
        ax.legend(fontsize=8, frameon=False)
        ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(HERE / "validate_data.svg")


if __name__ == "__main__":
    main()

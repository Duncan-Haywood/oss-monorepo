"""Draw figure.png from results.json: break-even person time per sheet against robot configuration, supervision 0.1 to 1.0."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    r = json.loads((HERE / "results.json").read_text())
    rows = r["grid"]
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    for i, g in enumerate(rows):
        b = g["breakeven_s"]
        ax.plot([b["0.1"], b["1.0"]], [i, i], lw=6, color="#4c78a8", solid_capstyle="butt")
        ax.plot([b["0.3"]], [i], "o", color="white", ms=5)
    ax.axvline(r["hand_taskbook_s"], color="#e45756", lw=1.5)
    ax.text(r["hand_taskbook_s"] - 4, len(rows) - 0.6, "taskbook's assumed\nperson time, 372 s", color="#e45756", fontsize=7, ha="right")
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels([f"{g['config']}" + (f" +${g['base']//1000}k base" if g["base"] else "") for g in rows], fontsize=7)
    ax.invert_yaxis()
    ax.set_xlabel("person seconds to nail one 62-nail sheet above which the G1 saves money (bar: supervision 0.1 to 1.0, dot 0.3)", fontsize=7)
    ax.set_title("How slow must a person be for a G1 nailing sheathing to pay?", fontsize=10)
    fig.tight_layout()
    fig.savefig(HERE / "figure.png", dpi=130)


main()

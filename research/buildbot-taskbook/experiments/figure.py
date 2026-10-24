"""Crew-hours per task of the framing house, coloured by whether the H1 passes its payload test -> figure.png."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
COLOUR = {"yes": "#2a9d8f", "no": "#e76f51", "out of reach": "#8d99ae"}
LABEL = {"yes": "H1 passes the payload test", "no": "too heavy for the H1", "out of reach": "outside the H1's reach"}


def main():
    rows = json.loads((HERE / "taskbook.json").read_text())["tasks"]
    rows = sorted(rows, key=lambda r: r["crew_hours_mid_A"])
    fig, ax = plt.subplots(figsize=(9.5, 6.4), constrained_layout=True)
    for i, r in enumerate(rows):
        c = COLOUR[r["h1_payload"]]
        lo, hi = r["crew_hours_5pct_A"], r["crew_hours_95pct_A"]
        ax.barh(i, r["crew_hours_mid_A"], color=c)
        ax.plot([lo, hi], [i, i], color="black", lw=1)
        ax.plot([r["crew_hours_mid_B"]], [i], marker="D", ms=4, color="white", mec="black", mew=0.8, ls="none") if r["trade"] == "framing" else None
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels([f"{r['id']} {r['verb']}: {r['task'][:44]}" for r in rows], fontsize=7)
    ax.set_xlabel("crew-hours for the walls, roof deck and drywall of a 28 x 40 ft house")
    handles = [plt.Rectangle((0, 0), 1, 1, color=COLOUR[k]) for k in COLOUR]
    handles.append(plt.Line2D([], [], marker="D", color="white", mec="black", ls="none", ms=5))
    ax.legend(handles, [LABEL[k] for k in COLOUR] + ["framing rows scaled to the cited norm"], loc="lower right", fontsize=8)
    ax.set_title("Where the hours are, and which the H1's static payload allows\n(bars: my minutes per unit; whiskers: 5-95% over a x1/3 to x3 sweep)", fontsize=10)
    fig.savefig(HERE / "figure.png", dpi=130)


if __name__ == "__main__":
    main()

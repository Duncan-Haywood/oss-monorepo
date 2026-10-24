"""Draw figure.png from results.json: simulated carry slowdown ranges against the break-even slowdown."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    r = json.loads((HERE / "results.json").read_text())["carry"]
    fig, ax = plt.subplots(figsize=(7, 3.8))
    rows = [("H1 vs one-stud labourer", "H1", "1"), ("H1 vs four-stud labourer", "H1", "4"),
            ("G1 vs one-stud labourer", "G1", "1"), ("G1 vs four-stud labourer", "G1", "4")]
    for i, (name, robot, b) in enumerate(rows):
        c = r[robot][b]
        ax.plot([c["min"], c["max"]], [i, i], lw=6, color="#4c78a8", solid_capstyle="butt")
        ax.plot([c["median"]], [i], "o", color="white", ms=5)
        s = r[robot]["s_star"]
        ax.plot([s["0.5"], s["0.1"]], [i + .28, i + .28], lw=3, color="#e45756", solid_capstyle="butt")
        ax.plot([s["0.3"]], [i + .28], "|", color="black", ms=9)
    ax.set_yticks(range(4))
    ax.set_yticklabels([n for n, _, _ in rows], fontsize=8)
    ax.set_xlabel("robot-hours per labourer-hour (blue: simulated carry range, dot = median; red: break-even, supervision 0.5 to 0.1, tick 0.3)")
    ax.xaxis.label.set_size(7)
    ax.set_title("Carrying studs: the H1 and G1 against the slowdown that pays for them", fontsize=10)
    fig.tight_layout()
    fig.savefig(HERE / "figure.png", dpi=130)


if __name__ == "__main__":
    main()

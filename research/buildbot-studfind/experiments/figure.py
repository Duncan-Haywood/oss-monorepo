"""Success against reading scatter, and the scatter allowed against layout scatter -> figure.png (reads results.json)."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
R = json.load(open(HERE / "results.json"))
COL = {"single, 1 read": "#e76f51", "single, 4 reads": "#e9c46a", "single, 16 reads": "#2a9d8f",
       "pooled, 1 read, 10 studs": "#264653", "re-measure each nail": "#6d597a"}


def main():
    fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.6), constrained_layout=True)
    g = R["A"]["grid_mm"]
    for k, c in COL.items():
        a.plot(g, [r[0] for r in R["A"][k]], marker="o", color=c, label=k)
    a.axhline(0.95, color="black", ls="--", lw=0.9)
    a.axvline(3.2, color="grey", ls=":", lw=1)
    a.text(3.3, 0.55, "vendor 'within 1/8 in'\nread as 1 sigma", fontsize=8, color="grey")
    a.set_xlabel("stud-finder reading scatter, 1 sigma (mm)")
    a.set_ylabel("P(all 62 nails inside their windows)")
    a.legend(fontsize=8, loc="lower left")
    a.set_title("One sheet needs reads good to about 1 mm", fontsize=10)
    L = R["B"]["layout_mm"]
    for k, c in COL.items():
        b.plot(L, R["B"][k], marker="o", color=c, label=k)
    b.set_xlabel("stud layout scatter about a 16 in grid, 1 sigma (mm)")
    b.set_ylabel("reading scatter allowed for 95% sheet success (mm)")
    b.set_title("Pooling only pays when the wall is straight", fontsize=10)
    b.grid(alpha=0.3)
    fig.savefig(HERE / "figure.png", dpi=130)


main()

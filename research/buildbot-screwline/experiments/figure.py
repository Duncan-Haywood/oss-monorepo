"""Success against reading scatter (wall and ceiling, 0 and 3 missed screws allowed) -> figure.png (reads results.json)."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
R = json.load(open(HERE / "results.json"))


def main():
    fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.6), constrained_layout=True)
    g = R["A"]["grid_mm"]
    style = {"wall, <=0 missed": ("#e76f51", "-"), "wall, <=3 missed": ("#e76f51", "--"),
             "ceiling, <=0 missed": ("#264653", "-"), "ceiling, <=3 missed": ("#264653", "--")}
    for k, (c, ls) in style.items():
        a.plot(g, R["A"][k], marker="o", color=c, ls=ls, label=k)
    a.axhline(0.95, color="black", ls=":", lw=0.9)
    a.axvline(3.2, color="grey", ls=":", lw=1)
    a.text(3.3, 0.8, "vendor 'within 1/8 in'\nread as 1 sigma", fontsize=8, color="grey")
    a.set_xlabel("stud-finder reading scatter, 1 sigma (mm)")
    a.set_ylabel("P(sheet has at most m missed screws)")
    a.legend(fontsize=8, loc="lower left")
    a.set_title("Allowing 3 missed screws buys about 0.6 mm", fontsize=10)
    keys = ["wall, <=0 missed", "wall, <=1 missed", "wall, <=3 missed"]
    for i, n in enumerate((1, 4, 16)):
        b.bar([j + 0.25 * i for j in range(3)], [R["B"][k][i] for k in keys], width=0.25, label="%d reads" % n)
    b.set_xticks([0.25, 1.25, 2.25])
    b.set_xticklabels(["0 missed", "<=1 missed", "<=3 missed"])
    b.set_ylabel("reading scatter allowed for 95% of sheets (mm)")
    b.set_title("Wall: averaging reads beats tolerating misses", fontsize=10)
    b.legend(fontsize=8)
    fig.savefig(HERE / "figure.png", dpi=130)


main()

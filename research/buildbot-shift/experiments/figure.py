"""Hours worked in an 8 h shift against average draw, for 1 to 3 packs -> figure.png."""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from buildbot_shift import model as S  # noqa: E402


def main():
    fig, ax = plt.subplots(figsize=(8, 5), constrained_layout=True)
    xs = list(range(120, 421, 5))
    for k, col in ((1, "#e76f51"), (2, "#2a9d8f"), (3, "#264653")):
        ax.plot(xs, [S.worked_hours(8.0, k, 1, power_w=p) for p in xs], color=col, label="%d pack(s), 1 charger" % k)
    ax.axvline(S.implied_power_w(), color="grey", ls="--", lw=0.8)
    ax.text(S.implied_power_w() + 3, 0.4, "vendor 2 h\n= %.0f W" % S.implied_power_w(), fontsize=8)
    ax.set_xlabel("average electrical draw while working (W)")
    ax.set_ylabel("hours worked in an 8 h shift")
    ax.set_ylim(0, 8.2)
    ax.legend(fontsize=8)
    ax.set_title("Unitree G1 pack logistics: 421 Wh packs, 270 W charger, 5 min swaps", fontsize=10)
    fig.savefig(HERE / "figure.png", dpi=130)


if __name__ == "__main__":
    main()

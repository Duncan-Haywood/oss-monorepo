"""Net saving per replaced crew-hour against robot slowdown -> figure.png (reads results.json for the break-evens)."""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from buildbot_cost import model as M  # noqa: E402


def main():
    w = M.WAGE_CARPENTER * 1.3
    fig, ax = plt.subplots(figsize=(8, 5), constrained_layout=True)
    xs = [0.5 + 0.05 * i for i in range(0, 191)]
    for robot, col in (("G1", "#2a9d8f"), ("H1", "#e76f51")):
        rate = M.robot_rate(M.PRICE_USD[robot], 6000, 0.10, 1000)
        for f, ls in ((0.1, "-"), (0.5, "--")):
            ax.plot(xs, [M.net_per_replaced_hour(w, rate, s, f) for s in xs], ls, color=col,
                    label="%s, supervision %.1f person-h per robot-h" % (robot, f))
    ax.axhline(0, color="black", lw=0.8)
    ax.set_xlabel("robot-hours per replaced crew-hour (slowdown)")
    ax.set_ylabel("net dollars saved per replaced crew-hour")
    ax.set_ylim(-40, 40)
    ax.legend(fontsize=8)
    ax.set_title("Where a stock humanoid breaks even against a $%.0f/h loaded carpenter\n(burden 1.3, life 6,000 h, upkeep 10%%/yr, 1,000 h/yr; launch prices)" % w, fontsize=10)
    fig.savefig(HERE / "figure.png", dpi=130)


if __name__ == "__main__":
    main()

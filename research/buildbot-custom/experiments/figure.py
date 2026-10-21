"""Sheet time against axis speed, and break-even houses a year against machine price -> figure.png (stdlib model + Matplotlib)."""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from buildbot_custom import model as M  # noqa: E402


def main():
    nails = M.schedule()
    hrs = M.nailing_hours(M.load_tasks())
    w = M.WAGE * 1.3
    fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.6), constrained_layout=True)
    for tf, col in ((0.125, "#2a9d8f"), (0.3, "#e9c46a"), (0.6, "#e76f51"), (1.0, "#6d597a")):
        vs = [0.3 + 0.1 * i for i in range(0, 48)]
        a.plot(vs, [min(M.sheet_cycle(nails, v, 3 * v, tf, m)[0] for m in ("rows", "greedy")) for v in vs], color=col, label="fire %.3g s a nail" % tf)
    a.axhline(62 * 6.0, color="black", ls="--", lw=0.9)
    a.text(3.0, 62 * 6.0 - 25, "hand nailing, taskbook minutes (372 s)", ha="right", fontsize=8)
    a.set_ylim(0, 400)
    a.set_xlabel("axis speed (m/s), acceleration 3 x speed (m/s$^2$)")
    a.set_ylabel("seconds to nail one 4x8 sheet (62 nails)")
    a.legend(fontsize=8)
    a.set_title("The machine nails a sheet in 20 to 120 s", fontsize=10)
    ps = [20e3 * 1.1 ** i for i in range(0, 40)]
    for scope, h, col in (("wall sheathing", hrs["wall"], "#2a9d8f"), ("wall + roof cassettes", hrs["wall"] + hrs["roof"], "#e76f51")):
        b.plot([p / 1e3 for p in ps], [M.breakeven_houses(p, 10, 0.0, 0.05, h, w, 0.2 * h) for p in ps], color=col, label=scope)
    b.set_xscale("log")
    b.set_yscale("log")
    b.set_xlabel("machine price ($ thousand)")
    b.set_ylabel("houses a year to break even")
    b.legend(fontsize=8)
    b.grid(alpha=0.3, which="both")
    b.set_title("Pays only at plant volume\n(10 y, no interest, upkeep 5%, operator keeps 20%)", fontsize=10)
    fig.savefig(HERE / "figure.png", dpi=130)


if __name__ == "__main__":
    main()

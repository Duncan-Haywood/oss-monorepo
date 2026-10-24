"""Write experiments/period_error.svg: period error against timestep for four integrators, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "6. absolute period error", 0, [1, 2, 3, 4])
    names = ["explicit Euler", "semi-implicit Euler", "velocity Verlet", "RK4"]
    write_lines(HERE, "period_error.svg", "Pendulum period error against timestep (90 deg swing, exact energy)",
                "Log-log plot of absolute period error in ppm against timestep for four integrators: Euler first order, semi-implicit Euler and Verlet second order and identical, RK4 fourth order",
                "timestep (s)", "|period error| (ppm)", list(zip(names, [xs] * 4, ys)), logx=True, logy=True)


if __name__ == "__main__":
    main()

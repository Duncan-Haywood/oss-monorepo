"""Write experiments/pos_error.svg: position error against steps per orbit, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "5. position error", 0, [2, 3, 4])
    names = ["semi-implicit Euler", "velocity Verlet", "RK4"]
    write_lines(HERE, "pos_error.svg", "Kepler orbit (e = 0.5): position error after 10 orbits against steps per orbit",
                "Log-log plot of position error in units of the semi-major axis against steps per orbit: RK4 falls by more than 16 times per doubling once resolved, the two symplectic methods about 4 times",
                "steps per orbit", "position error (a)", list(zip(names, [xs] * 3, ys)), logx=True, logy=True)


if __name__ == "__main__":
    main()

"""Write experiments/margin_error_vs_dt.svg from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "2.", 0, [1, 2, 3])
    ys = [[-v for v in y] for y in ys]
    series = [("explicit Euler", xs, ys[0]), ("exact zero-order hold", xs, ys[2])]
    write_lines(HERE, "margin_error_vs_dt.svg", "How much delay margin a fixed-step simulator under-reports, against step size (zeta = 0.7)",
                "Line plot of the percentage by which a fixed-step simulation under-reports the true delay margin of a PD-controlled double integrator, against the step size in seconds: about 19 percent at 0.1 s falling to 1 percent at 0.005 s",
                "step size dt (s)", "margin under-reported (%)", series)


if __name__ == "__main__":
    main()

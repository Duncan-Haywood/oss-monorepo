"""Write experiments/width_sweep.svg: shape error against arm width, 2D chain and 3D sheet, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2])
    series = list(zip(["2D chain (hanger-fit)", "3D sheet"], [xs] * len(ys), ys))
    write_lines(HERE, "width_sweep.svg", "Arm width sweep, size M tee: 2D chain against 3D sheet",
                "Line plot of seam shape error in cm against hanger arm half-width in cm; the 2D chain and the 3D sheet both reach their minimum at 22.8 cm and differ by under 0.5 cm",
                "arm half-width (cm)", "seam shape error (cm)", series)


if __name__ == "__main__":
    main()

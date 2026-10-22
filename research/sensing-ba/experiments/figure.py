"""Write experiments/ba_vs_position_error.svg from results.txt (never retyped numbers).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [2, 4])
    write_lines(HERE, "ba_vs_position_error.svg", "Bundle adjustment removes camera position error",
                "Line plot of mean surface error against camera position error: triangulation with wrong poses grows linearly, bundle adjustment stays at the true-pose floor",
                "camera position error per axis (object radii)", "mean surface error (radii)",
                [("triangulate, wrong poses (aligned)", xs, ys[0]), ("after bundle adjustment", xs, ys[1])])


if __name__ == "__main__":
    main()

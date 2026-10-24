"""Write experiments/area_by_width.svg: synthesised area against hidden width, parsed from fit.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "fit.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== area by hidden width", 0, [1, 2, 3, 4])
    names = ["2-bit weights", "3-bit", "4-bit", "8-bit"]
    write_lines(HERE, "area_by_width.svg", "Streaming KWS engine: SKY130 area by hidden width (um2; one 1x1 tile = 18,032)",
                "Line plot of synthesised area in square micrometres against hidden width 8 to 64 for 2, 3, 4 and 8-bit weights; area grows roughly linearly with width and 8-bit weights add about 3,000 square micrometres over 4-bit",
                "hidden width H", "area, um2 (SKY130 HD, synthesis only)", list(zip(names, [xs] * 4, ys)))


if __name__ == "__main__":
    main()

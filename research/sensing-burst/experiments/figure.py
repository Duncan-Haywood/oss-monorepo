"""Write experiments/burst_vs_large.svg: PSNR against burst length, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== A1.", 0, [1, 2])
    write_lines(HERE, "burst_vs_large.svg", "Small-sensor burst against one 4x-area frame (read noise 8 e-)",
                "Line plot of display PSNR against the number of merged small-sensor frames; the burst starts far below one large-sensor frame and crosses it near 9 frames",
                "frames merged, N", "display PSNR (dB)",
                [("small-sensor burst", xs, ys[0]), ("one large-sensor frame", xs, ys[1])], logx=True)


if __name__ == "__main__":
    main()

"""Write experiments/superres_vs_n.svg: PSNR against burst length, parsed from results.txt.

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
    xs, ys = table(TEXT, "== E1.", 0, [3, 5, 6, 7])
    write_lines(HERE, "superres_vs_n.svg", "Burst super-resolution against merge-then-upsample (2x, bright light)",
                "Line plot of PSNR against the number of merged low-resolution frames: the super-resolved reconstruction climbs from 24 to 31 dB while merge, deblur and upsample flattens near 27 dB",
                "frames merged, N", "PSNR (dB)",
                [("merge + deblur + upsample", xs, ys[0]), ("super-resolution (estimated shifts)", xs, ys[1]),
                 ("one frame, 2x pixels", xs, ys[2]), ("2x-pixel sensor, N frames", xs, ys[3])], logx=True)


if __name__ == "__main__":
    main()

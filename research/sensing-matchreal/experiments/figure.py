"""Write experiments/mismatch_vs_ratio.svg from results.txt (never retyped numbers).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== A2.", 0, [1, 2, 3, 4])
    write_lines(HERE, "mismatch_vs_ratio.svg", "What a real matcher's mismatches look like as the ratio test tightens",
                "Line plot of mismatch rate and the along-epipolar, near and far shares of the mismatches against the ratio-test threshold, on a real stereo pair",
                "ratio-test threshold (1.0 = no test)", "fraction",
                [("mismatch rate", xs, ys[0]), ("share along epipolar line", xs, ys[1]),
                 ("share near (10-40 px)", xs, ys[2]), ("share far", xs, ys[3])])


if __name__ == "__main__":
    main()

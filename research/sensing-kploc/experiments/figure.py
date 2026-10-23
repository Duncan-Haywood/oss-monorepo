"""Write experiments/kploc_vs_noise.svg from results.txt (never retyped numbers).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== F.", 0, [1], sep="|")
    write_lines(HERE, "kploc_vs_noise.svg", "How accurately SIFT localises keypoints as image noise grows",
                "Line plot of per-keypoint localisation error per axis in pixels against Gaussian image noise in grey levels, on warped real photographs",
                "image noise sigma (grey levels of 255)", "sigma per axis (px)",
                [("per-keypoint sigma per axis", xs, ys[0])])


if __name__ == "__main__":
    main()

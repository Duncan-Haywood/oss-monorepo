"""Write experiments/recall.svg: measured face recall against face width, with the assumed curve.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (section H), never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("== H.", "== H").splitlines()


def main():
    xs, ys = table(TEXT, "== H", 0, [1, 2, 3, 4, 5])
    names = ["YuNet, score 0.3", "YuNet, score 0.6", "YuNet, score 0.9", "Haar frontal", "assumed (capture-bystander)"]
    write_lines(HERE, "recall.svg", "Face detector recall against face width, measured",
                "Line plot of recall against face width in pixels for YuNet at three score thresholds, a Haar cascade and the assumed curve; YuNet at 0.6 reaches full recall at 16 pixels, where the assumed curve is at 0.29",
                "face width (px, log scale)", "recall", list(zip(names, [xs] * 5, ys)), logx=True)


if __name__ == "__main__":
    main()

"""Write experiments/focal_spread.svg: width of the 5-95% focal-error band against views, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def bands(lines):
    """{(model, 'A'|'B'): [(k, p95-p5)]} parsed from results.txt."""
    out, model, sec = {}, None, None
    for l in lines:
        if l.startswith("== model"):
            model = l.split()[2].rstrip(":")
        elif l.startswith("A. "):
            sec = "A"
        elif l.startswith("B. "):
            sec = "B"
        else:
            p = l.split()
            if model and sec and len(p) >= 6 and p[0].isdigit():
                out.setdefault((model, sec), []).append((float(p[0]), float(p[4]) - float(p[3])))
    return out


def main():
    b = bands((HERE / "results.txt").read_text().splitlines())
    series = []
    for (model, sec), name in [(("full", "A"), "full model, real images"), (("full", "B"), "full model, synthetic"),
                               (("lean", "A"), "lean model, real images"), (("lean", "B"), "lean model, synthetic")]:
        pts = b[(model, sec)]
        series.append((name, [x for x, _ in pts], [y for _, y in pts]))
    write_lines(HERE, "focal_spread.svg", "Focal-length spread against calibration views",
                "Line plot of the width of the 5 to 95 percent band of focal-length error against the number of checkerboard views for two distortion models, on real and re-rendered synthetic images; the band narrows from about 2 to 3 percent at 3 views to about 0.5 to 1 percent at 12",
                "views used in the calibration", "5-95% band width of focal error (%)", series)


if __name__ == "__main__":
    main()

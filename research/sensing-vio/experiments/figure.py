"""Write experiments/drift_vs_width.svg: rms drift against camera width, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    pts = {}
    for line in (HERE / "results.txt").read_text().splitlines():
        c = [x.strip() for x in line.split("|")]
        if len(c) >= 5 and c[1] == "base":
            pts[640] = float(c[2].split()[0])
        elif len(c) >= 5 and c[1].startswith("width ") and c[1].endswith("px"):
            pts[int(c[1].split()[1][:-2])] = float(c[2].split()[0])
    xs = sorted(pts)
    write_lines(HERE, "drift_vs_width.svg", "Visual-inertial drift against camera width (synthetic)",
                "Line plot of the rms position error of a planar visual-inertial smoother as a percentage of path length, "
                "against camera width in pixels; the error is lowest at 1280 pixels and highest at 320",
                "camera width (px)", "rms drift (% of path)", [("planar VIO smoother", xs, [pts[x] for x in xs])])


if __name__ == "__main__":
    main()

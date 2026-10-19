"""Write experiments/framed.svg: share of time each platform holds the framing distance, against crowd density, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["tripod", "wheeled, no avoidance", "wheeled", "wheel-legs", "drone, no avoidance", "drone"]


def main():
    xs, ys = table(TEXT, "== D. framed", 0, list(range(1, 7)))
    if len(xs) < 3:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "framed.svg", "Time holding the framing distance against crowd density",
                "Line plot: the share of time each follow platform keeps within 25 percent of 2.5 m from the creator, at three crowd densities",
                "crowd density (people per m2)", "framed time (%)",
                list(zip(NAMES, [xs] * 6, ys)), logx=True)


if __name__ == "__main__":
    main()

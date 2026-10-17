"""Write experiments/lifetime_cdf.svg: share of research PRs merged within N minutes of creation, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text()


def main():
    rows = re.findall(r"merged within\s+(\d+) min of creation:\s+\d+/\d+ \((\d+)%\)", TEXT)
    if not rows:
        raise SystemExit("no 'merged within' rows in results.txt")
    xs, ys = [float(a) for a, _ in rows], [float(b) for _, b in rows]
    write_lines(HERE, "lifetime_cdf.svg", "Research PRs: share merged within N minutes of creation",
                "Line plot of the share of research pull requests merged within 5 to 240 minutes of creation; 80 percent merge within 5 minutes and all within 240",
                "minutes since PR creation", "share merged (%)", [("PRs merged", xs, ys)], logx=True)


if __name__ == "__main__":
    main()

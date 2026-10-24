"""Write experiments/leak.svg: per-frame leak against distance for each blurring policy, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["face detector", "body detector, blur head", "both"]


def main():
    xs, ys = table(TEXT, "== A.", 0, [2, 3, 4])
    if len(xs) < 3:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "leak.svg", "Unblurred identifiable bystander, 360 8K",
                "Line plot: chance an identifiable bystander is left unblurred in a frame against distance, for three blurring policies",
                "distance to bystander (m)", "per-frame leak probability",
                list(zip(NAMES, [xs] * 3, ys)))


if __name__ == "__main__":
    main()

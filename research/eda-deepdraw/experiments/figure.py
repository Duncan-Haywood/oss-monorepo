"""Write experiments/bound.svg from results.txt block B (run analyse.py first)."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [1])
    write_lines(HERE, "bound.svg", "Detection probability that clean vectors still allow",
                "Line plot of the 95 percent upper bound on a survivor's per-vector detection probability against the number of clean random vectors, falling roughly as 3 over n",
                "clean random vectors per survivor", "95% upper bound on p", [("bound", xs, ys[0])], logx=True, logy=True)


if __name__ == "__main__":
    main()

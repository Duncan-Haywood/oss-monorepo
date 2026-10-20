"""Write experiments/ci_width_vs_accuracy.svg: 95% interval width of human-only and PPI
prevalence estimates against LLM coder accuracy (results.txt, E3).

    python3 experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "E3.", 0, [2, 3])
    series = list(zip(["200 hand-coded only", "PPI: LLM codes on all 5,000 + 200 hand-coded"], [xs] * 2, ys))
    write_lines(HERE, "ci_width_vs_accuracy.svg",
                "Width of the 95% interval for a code's prevalence",
                "Line plot: the human-only interval stays near 0.127 wide at every coder accuracy; the PPI interval "
                "is wider below about 80% accuracy and narrows to 0.046 at 98%",
                "LLM coder accuracy (sensitivity = specificity)", "95% interval width", series)


if __name__ == "__main__":
    main()

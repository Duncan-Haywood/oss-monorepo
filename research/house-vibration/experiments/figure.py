"""Write experiments/span_vs_frequency.svg: maximum floor-joist clear span against the frequency limit, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "E. Maximum clear span", 0, [1, 2, 3, 4])
    names = ["2x8 @16 in", "2x10 @16 in", "2x10 @24 in", "2x12 @24 in"]
    write_lines(HERE, "span_vs_frequency.svg", "Floor joist span against a natural-frequency limit (SPF No. 2)",
                "Line plot of the longest clear span of four floor joists against a minimum natural frequency in hertz; spans are flat up to about 10 hertz and fall steeply above 12",
                "minimum natural frequency (Hz)", "max clear span (ft)", list(zip(names, [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()

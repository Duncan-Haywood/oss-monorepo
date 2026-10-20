"""Write experiments/span_vs_frequency.svg: 2x10 at 16 in maximum span against a frequency limit, bare and composite, parsed from results.txt.

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
    xs, ys = table(TEXT, "D. Maximum clear span", 0, [1, 2, 3, 4])
    names = ["joist alone", "gamma 0 (loose panel)", "gamma 0.5", "gamma 1 (glued T-beam)"]
    write_lines(HERE, "span_vs_frequency.svg", "2x10 at 16 in: span against a frequency limit, with and without subfloor action",
                "Line plot of the longest clear span of a 2x10 floor joist at 16 inches against a minimum natural frequency in hertz, for a bare joist and three levels of subfloor composite action; the composite lines stay flat to higher limits",
                "minimum natural frequency (Hz)", "max clear span (ft)", list(zip(names, [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()

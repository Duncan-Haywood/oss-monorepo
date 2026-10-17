"""Write experiments/errgain.svg: mean gain of the best pair over the best single garment against the wearer's error rate, budget $100, for the two error models (sections A and F of results.txt).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

ROW = re.compile(r"budget <= 100, e = ([\d.]+): .*mean gain ([+-][\d.]+) C")


def series(text, start, stop):
    xs, ys, on = [], [], False
    for l in text:
        if l.startswith(start):
            on = True
        elif on and l.startswith(stop):
            break
        elif on and (m := ROW.match(l)):
            xs.append(float(m[1]))
            ys.append(float(m[2]))
    return xs, ys


def main():
    text = (HERE / "results.txt").read_text().splitlines()
    ux, uy = series(text, "== A.", "== B.")
    wx, wy = series(text, "== F.", "== Z")
    write_lines(HERE, "errgain.svg", "Pair's edge over one garment as the wearer errs ($100)",
                "Line plot of the mean comfort gain of the best two-garment wardrobe over the best single garment at a 100 dollar budget against the wearer's error rate, for uniform errors (the edge holds) and worst-option errors (the edge nearly vanishes)",
                "error rate e (share of scenarios with a wrong pick)", "mean gain of pair over single (C)",
                [("errors uniform over wrong options", ux, uy), ("every error is the worst option", wx, wy)])


if __name__ == "__main__":
    main()

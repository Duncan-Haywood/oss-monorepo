"""Write experiments/print-wait.svg: fleet against the print wait of a printed bushing, parsed from results.txt.

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
    x1, y1 = table(TEXT, "== A1.", 0, [6])
    x2, y2 = table(TEXT, "== A2.", 0, [6])
    ref = float(next(l for l in TEXT if l.startswith("stock bearings")).split("fleet")[1].split()[0])
    write_lines(HERE, "print-wait.svg", "Printed bushing: working fleet against the print wait per bushing repair",
                "Line plot of the simulated working fleet against hours of printing a repair waits for a printed bushing, for a bushing as durable as the LM8UU and one half as durable, with the stock-bearing fleet as a reference line",
                "extra hours a bushing repair waits for the print", "working machines (median)",
                [("bushing life x1", x1, y1[0]), ("bushing life x0.5", x2, y2[0])], logx=True, hline=ref)


if __name__ == "__main__":
    main()

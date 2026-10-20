"""Write experiments/cloth.svg: cloth to cut the 20 feasible orders against the per-marker setup cost, parsed from results.txt.

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
    xs, ys = table(TEXT, "setup_cm  orders", 0, [2, 3, 4])
    names = ["one garment per marker", "single-size markers", "any size mix (optimal)"]
    write_lines(HERE, "cloth.svg", "Cutting plans: cloth for 20 orders vs setup cost",
                "Line plot of total cloth in metres to cut 20 shirt orders under three cutting plans against the setup cost per marker: one garment per marker uses about 10 percent more cloth than the two plans that lay several garments per marker, which are within 1 to 4 percent of each other",
                "setup cost per marker (cm of cloth)", "cloth for 20 orders (m)", list(zip(names, [xs] * 3, ys)))


if __name__ == "__main__":
    main()

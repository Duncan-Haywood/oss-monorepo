"""Write experiments/ratio.svg: price ratio a heat pump may pay before a sand store is cheaper, against standby days (section E of results.txt).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    series = []
    for tag, name in (("house", "house, 10 MWh/yr"), ("district", "district, 5 GWh/yr")):
        text = [l for l in LINES if l.startswith("E. ") or l.startswith(tag + " ")]
        text = text[text.index(next(l for l in text if l.startswith("E. "))):]
        xs, ys = table(text, "E. ", 1, [2])
        series.append((name, xs, ys[0]))
    write_lines(HERE, "ratio.svg", "Sand store vs heat pump: electricity price ratio needed",
                "Line plot: how many times dearer a heat pump's electricity must be than the sand store's "
                "before the store delivers heat for less, against days the heat stands, for a house and a district",
                "days of standby before use", "price ratio (heat pump / store)", series, logx=True, logy=True,
                hline=1.0)


if __name__ == "__main__":
    main()

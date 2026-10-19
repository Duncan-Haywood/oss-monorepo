"""Write experiments/standby.svg: heat delivered per kWh put in against standby days, from section E of results.txt.

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
    for tag, name in (("sand", "sand 500 C"), ("water", "water 90 C")):
        text = [l for l in LINES if l.startswith("E. ") or l.startswith(tag + " ")]
        text = text[text.index(next(l for l in text if l.startswith("E. "))):]
        xs, ys = table(text, "E. ", 1, [3])
        series.append((name, xs, ys[0]))
    write_lines(HERE, "standby.svg", "Heat store: heat delivered per kWh charged vs standby time",
                "Line plot: a 10 MWh sand store and a 10 MWh hot-water tank, 0.5 m of mineral wool; "
                "delivered heat per kWh put in falls as the store stands longer before use",
                "days of standby before use", "heat delivered / energy put in", series, logx=True)


if __name__ == "__main__":
    main()

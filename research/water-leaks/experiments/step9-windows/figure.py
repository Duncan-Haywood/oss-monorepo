"""Write experiments/step9-windows/window_chance.svg: P(chance >= 2019 count) against the match window.

    python experiments/step9-windows/figure.py   # from research/water-leaks; reads cells.tsv

Numbers are parsed from the committed cells.tsv. A P of 0.000 (none of 1,000 draws) is drawn at 0.0005.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

SHOW = [("D1-F", "0"), ("D1-F", "1"), ("LILA-auto", "0"), ("LILA-auto", "1"), ("M3", "0"), ("M3", "1")]


def main():
    rows = [ln.split("\t") for ln in (HERE / "cells.tsv").read_text().splitlines()[1:] if ln]
    series = []
    for det, phi in SHOW:
        pts = sorted((int(r[0]), max(float(r[10]), 0.0005)) for r in rows if r[2] == det and r[1] == phi)
        label = f"{det}, {'ungated' if phi == '0' else 'gate 1 m3/h'}"
        series.append((label, [x for x, _ in pts], [y for _, y in pts]))
    write_lines(HERE, "window_chance.svg", "BattLeDIM 2019: detection count against chance, by match window",
                "Line plot of the probability that random alarms score at least each detector's 2019 detection count, "
                "against the match window (14, 30, 60 days), ungated and with a 1 m3/h flow gate; each detector "
                "crosses 0.05 under some rule, the location score (not shown) is below 0.001 under all of them",
                "match window (days after onset or gate)", "P(chance >= detections)",
                series, logy=True, hline=0.05)


if __name__ == "__main__":
    main()

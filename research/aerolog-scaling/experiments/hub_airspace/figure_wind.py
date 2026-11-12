"""Write wind_factor.svg: how much a steady wind raises one layer's en-route conflicts (milestone 11b).

    python3 figure_wind.py

Numbers are parsed from the committed wind_results.txt (section C), never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rows = {}
    on = False
    for l in (HERE / "wind_results.txt").read_text().splitlines():
        if l.startswith("## C."):
            on = True
            continue
        if on and l.startswith("##"):
            break
        if on and "|" in l and l[:1].isdigit():
            head, *cells = l.split("|")
            w, rel = float(head.split()[0]), int(head.split()[1])
            fac, ltf = (float(x) for x in cells[2].split()[:2])
            rows[(w, rel)] = (fac, ltf)
    ws = sorted({w for w, _ in rows})
    xs = [0.0] + ws
    series = [("conflicts, wind along axis", xs, [1.0] + [rows[(w, 0)][0] for w in ws]),
              ("conflicts, wind across axis", xs, [1.0] + [rows[(w, 90)][0] for w in ws]),
              ("time in layer, along", xs, [1.0] + [rows[(w, 0)][1] for w in ws]),
              ("time in layer, across", xs, [1.0] + [rows[(w, 90)][1] for w in ws])]
    write_lines(HERE, "wind_factor.svg",
                "Hub in wind: en-route conflicts vs still air (NYC, 20 m/s, one layer)",
                "Line plot: one layer's en-route conflicts rise with the ratio of wind speed to airspeed, more with the "
                "wind along Manhattan's axis than across it, tracking the rise in each flight's time in the layer",
                "wind speed / airspeed", "factor vs still air", series)


if __name__ == "__main__":
    main()

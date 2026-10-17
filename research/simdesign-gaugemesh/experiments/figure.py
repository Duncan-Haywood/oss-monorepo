"""Write experiments/peak_vs_h.svg: median peak stress of the gauge-2 designs against mesh size, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

LIMIT_MPA = 100.0


def medians(text):
    """{kind: ([h], [median peak MPa])} from the 'rules:' / 'free:' blocks."""
    out, kind = {}, None
    for l in text:
        m = re.match(r"(rules|free): n=\d+", l)
        if m:
            kind = m.group(1)
            out[kind] = ([], [])
            continue
        m = re.match(r"\s+h=([\d.]+): feasible .*median ([\d.]+)", l)
        if m and kind:
            out[kind][0].append(float(m.group(1)))
            out[kind][1].append(float(m.group(2)))
    if not out or not all(v[0] for v in out.values()):
        raise SystemExit("no rows parsed from results.txt")
    return out


def main():
    data = medians((HERE / "results.txt").read_text().splitlines())
    series = [(f"{k} (n={len(v[0])} meshes)", v[0], v[1]) for k, v in data.items()]
    write_lines(HERE, "peak_vs_h.svg", "Gauge-2 designs re-solved on finer meshes: median peak stress",
                "Line plot of the median peak von Mises stress of the gauge-2 bracket designs against mesh size h; "
                "every design is at or under the 100 MPa limit at h = 2.5 mm and over it at h = 1.5 mm and finer",
                "mesh size h (mm), logarithmic", "median peak stress (MPa); dashed line = 100 MPa limit",
                series, logx=True, hline=LIMIT_MPA)


if __name__ == "__main__":
    main()

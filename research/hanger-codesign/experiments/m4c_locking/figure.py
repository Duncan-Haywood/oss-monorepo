"""Write dc_error_vs_ea.svg: simulated minus measured drape coefficient against stretch stiffness EA.

    python3 experiments/m4c_locking/figure.py

Parsed from the committed results.txt (section 1, 2.5 mm rows, both branches), never retyped.
Five of the nine fabrics are drawn so the lines stay legible; all nine are in results.txt.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

SHOW = ("F1", "F3", "F5", "F7", "F9")


def main():
    meas = json.loads((HERE / "results.json").read_text())["measured"]
    lines = (HERE / "results.txt").read_text().splitlines()
    start = next(i for i, ln in enumerate(lines) if ln.startswith("1. every stage"))
    pts = {c: [] for c in SHOW}
    for ln in lines[start + 1:]:
        if not ln.strip():
            break
        t = ln.split()
        if t[0] in pts and t[1] == "2.5":
            pts[t[0]].append((float(t[3]), float(t[4]) - meas[t[0]]))
    series = []
    for c in SHOW:
        p = sorted(pts[c])
        series.append((f"{c} (measured {meas[c]:.3f})", [x for x, _ in p], [y for _, y in p]))
    write_lines(HERE, "dc_error_vs_ea.svg",
                "Cloth FEM drape error keeps falling as stretch stiffness drops",
                "Line plot of simulated minus measured Cusick drape coefficient against membrane stretch stiffness "
                "EA from 18.75 N/m to each fabric's secant stiffness, for five woven fabrics at a fixed fold count; "
                "every line rises steadily with EA and none flattens",
                "membrane stretch stiffness EA (N/m, log scale)", "simulated DC minus measured DC",
                series, logx=True, hline=0.0)


if __name__ == "__main__":
    main()

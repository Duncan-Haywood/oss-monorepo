"""Write dc_vs_ea_two_elements.svg: drape error against stretch stiffness, conforming against nonconforming.

    python3 experiments/m4d_nonconforming/figure.py

Parsed from the committed results.txt files (4d section 1, nonconforming rows at gamma 0.1 on
3.75 mm; 4c section 1, conforming upward rows on 3.75 mm), never retyped. Three of the nine fabrics
are drawn so the lines stay legible; all nine are in results.txt.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

SHOW = ("F1", "F5", "F9")


def block(path):
    lines = path.read_text().splitlines()
    start = next(i for i, ln in enumerate(lines) if ln.startswith("1. every stage"))
    out = []
    for ln in lines[start + 1:]:
        if not ln.strip():
            break
        out.append(ln.split())
    return out


def main():
    meas = json.loads((HERE / "results.json").read_text())["measured"]
    nc = {c: [] for c in SHOW}
    for t in block(HERE / "results.txt"):
        if t[0] == "cr" and t[1] in nc and t[2] == "3.75" and float(t[3]) == 0.1:
            nc[t[1]].append((float(t[4]), float(t[5]) - meas[t[1]]))
    co = {c: [] for c in SHOW}
    for t in block(HERE.parent / "m4c_locking" / "results.txt"):
        if t[0] in co and t[1] == "3.75" and t[2] == "up":
            co[t[0]].append((float(t[3]), float(t[4]) - meas[t[0]]))
    series = []
    for c in SHOW:
        for lab, d in (("conforming", co), ("edge-midpoint", nc)):
            p = sorted(d[c])
            series.append((f"{c} {lab}", [x for x, _ in p], [y for _, y in p]))
    write_lines(HERE, "dc_vs_ea_two_elements.svg",
                "Drape error against stretch stiffness: conforming vs edge-midpoint membrane",
                "Line plot of simulated minus measured Cusick drape coefficient against membrane stretch stiffness EA "
                "from 150 N/m to each fabric's secant stiffness, for three woven fabrics on the 3.75 mm lattice, "
                "with the conforming triangle element of milestone 4c and the edge-midpoint element of milestone 4d",
                "membrane stretch stiffness EA (N/m, log scale)", "simulated DC minus measured DC",
                series, logx=True, hline=0.0)


if __name__ == "__main__":
    main()

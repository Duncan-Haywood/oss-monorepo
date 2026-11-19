"""Draw experiments/strip_viscous.svg (how viscous heave/pitch damping closes the strip-theory vs STAWAVE-2 gap).

    python3 experiments/figure_strip_viscous.py

Reads the `row` lines of results_strip_viscous.txt (milestone 7za). Stdlib only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def parse_rows(text):
    """[(zeta, mono peak ratio, mono area ratio, in-range area ratio, pooled 1 m/s ratio)] from the `row` lines."""
    out = []
    for line in text.splitlines():
        if line.startswith("row "):
            p = line.split()
            out.append(tuple(float(v) for v in p[1:6]))
    return out


if __name__ == "__main__":
    rows = parse_rows((HERE / "results_strip_viscous.txt").read_text())
    z = [100 * r[0] for r in rows]
    series = [
        ("4 m monohull, Fr 0.16: regular-wave peak ratio", z, [r[1] for r in rows]),
        ("4 m monohull, Fr 0.16: area ratio (lambda/L 0.3-3)", z, [r[2] for r in rows]),
        ("in-range Wigley (L/B 7), Fr 0.20: area ratio", z, [r[3] for r in rows]),
        ("4 m monohull: pooled NDBC head seas at 1 m/s", z, [r[4] for r in rows]),
    ]
    write_lines(HERE, "strip_viscous.svg",
                "How much damping closes strip theory's gap to STAWAVE-2?",
                "Ratio of Gerritsma-Beukelman strip-theory added resistance to ITTC STAWAVE-2, against an equivalent "
                "viscous heave and pitch damping (percent of critical). A ratio of 1 means the methods agree",
                "viscous damping, % of critical", "strip theory / STAWAVE-2", series, hline=1.0)

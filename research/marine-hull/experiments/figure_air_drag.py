"""Draw experiments/air_drag.svg (hydrofoil range over the monohull's against hotel load, one line per CdA).

    python3 experiments/figure_air_drag.py

Reads the `curve` rows of results_air_drag.txt (milestone 7w). Stdlib only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def parse_curves(text):
    """{cda: [(hotel, foil_ratio, planing_ratio)]} from the `curve` rows."""
    out = {}
    for line in text.splitlines():
        if line.startswith("curve "):
            _, cda, h, foil, plan, _, _ = line.split()
            out.setdefault(float(cda), []).append((float(h), float(foil), float(plan)))
    return out


if __name__ == "__main__":
    curves = parse_curves((HERE / "results_air_drag.txt").read_text())
    series = [(f"CdA {c:g} m2", [r[0] for r in rows], [r[1] for r in rows])
              for c, rows in sorted(curves.items()) if c in (0.0, 0.1, 0.2, 0.4)]
    write_lines(HERE, "air_drag.svg",
                "Does air drag move where a hydrofoil out-ranges a monohull?",
                "Hydrofoil peak range over the 4 m monohull's, central cases, still-air drag 0.5 rho CdA u^2 on both; "
                "break-even moves from 659 W (no air drag) to 818 W at CdA 0.4 m2",
                "hotel load, W (log)", "range ratio hydrofoil/monohull (log)", series,
                logx=True, logy=True, hline=1.0, vline=[200.0], xticks=[1, 10, 100, 1000, 10000])

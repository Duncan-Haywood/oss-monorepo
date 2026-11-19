"""Draw experiments/wind_air_drag.svg (hydrofoil range over the monohull's against hotel load, still air
against measured NDBC wind, CdA 0.1 and 0.4 m2).

    python3 experiments/figure_wind_air_drag.py

Reads the `curve` rows of results_wind_air_drag.txt (milestone 7x). Stdlib only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def parse_curves(text):
    """{(scenario, cda): [(hotel, foil_ratio)]} from the `curve` rows."""
    out = {}
    for line in text.splitlines():
        if line.startswith("curve "):
            _, scen, cda, h, foil = line.split()
            out.setdefault((scen, float(cda)), []).append((float(h), float(foil)))
    return out


if __name__ == "__main__":
    curves = parse_curves((HERE / "results_wind_air_drag.txt").read_text())
    pick = [("still_air", 0.1, "still air, CdA 0.1"), ("pooled_wind", 0.1, "NDBC wind, CdA 0.1"),
            ("still_air", 0.4, "still air, CdA 0.4"), ("pooled_wind", 0.4, "NDBC wind, CdA 0.4"),
            ("pooled_x1.5", 0.4, "NDBC wind x1.5, CdA 0.4")]
    series = [(lab, [r[0] for r in curves[(s, c)]], [r[1] for r in curves[(s, c)]]) for s, c, lab in pick]
    write_lines(HERE, "wind_air_drag.svg",
                "Does real ocean wind move where a hydrofoil out-ranges a monohull?",
                "Hydrofoil peak range over the 4 m monohull's, central cases; air drag averaged over all headings and "
                "84,776 NDBC ten-minute winds (2024). Break-even 700 -> 706 W at CdA 0.1 m2, 818 -> 841 W at 0.4 m2",
                "hotel load, W (log)", "range ratio hydrofoil/monohull (log)", series,
                logx=True, logy=True, hline=1.0, vline=[200.0], xticks=[1, 10, 100, 1000, 10000])

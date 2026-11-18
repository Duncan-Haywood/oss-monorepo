"""Draw experiments/range_speed.svg (range against speed per rung) from results_range_speed.txt.

    python3 experiments/figure_range_speed.py

The paper's TikZ version is paper/fig_range_speed.tex (paper/make_figures.py); both read the same
committed results file, so no number is retyped. Stdlib only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
sys.path.insert(0, str(HERE.parent / "paper"))
from linefig import write_lines  # noqa: E402
from make_figures import parse_curves, RUNGS  # noqa: E402

if __name__ == "__main__":
    curves = parse_curves((HERE / "results_range_speed.txt").read_text())
    series = [(n, [u for u, _ in curves[n]], [k for _, k in curves[n]]) for n in RUNGS]
    write_lines(HERE, "range_speed.svg",
                "Range against speed per hull type (200 kg, 10 kWh, 30 W hotel)",
                "Range in km against speed in m/s for five survey-craft hull types at the centre of each swept box; "
                "the monohull peaks highest at about 1 m/s, the foil and planing hull only operate far faster and reach a tenth of its range",
                "speed (m/s, log scale)", "range (km)", series, logx=True, xticks=[0.3, 0.5, 1, 2, 5, 10, 20])

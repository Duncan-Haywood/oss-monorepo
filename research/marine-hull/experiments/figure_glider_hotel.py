"""Draw experiments/glider_hotel.svg (glider/AUV range ratio against the hotel-load ratio).

    python3 experiments/figure_glider_hotel.py

Reads results_glider_hotel_curve.txt through paper/make_figures.py's parser; the paper's TikZ
version is paper/fig_glider_hotel.tex. Stdlib only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
sys.path.insert(0, str(HERE.parent / "paper"))
from linefig import write_lines  # noqa: E402
from make_figures import parse_hotel_curve  # noqa: E402

if __name__ == "__main__":
    rows, wide, band, be = parse_hotel_curve((HERE / "results_glider_hotel_curve.txt").read_text())
    xs = [r[0] for r in rows]
    series = [("median", xs, [r[3] for r in rows]),
              ("10th pct", xs, [r[2] for r in rows]),
              ("90th pct", xs, [r[4] for r in rows]),
              ("median, AUV to 4 m/s", [r[0] for r in wide], [r[3] for r in wide])]
    write_lines(HERE, "glider_hotel.svg",
                "Underwater glider vs propeller AUV: range ratio against hotel-load ratio",
                f"Glider-over-AUV range ratio for 2,430 cases against the AUV's hotel load as a multiple of the glider's; "
                f"the glider wins once the AUV's hotel load exceeds about {be:.2f} times its own",
                "AUV hotel load / glider hotel load (log)", "range ratio glider/AUV (log)", series,
                logx=True, logy=True, hline=1.0, vline=[be], xticks=[0.1, 1, 10, 100, 1000])

"""Draw experiments/hotel_ranking.svg (each rung's range over the monohull's against hotel load).

    python3 experiments/figure_hotel_ranking.py

Reads results_hotel_ranking.txt through paper/make_figures.py's parser; the paper's TikZ version is
paper/fig_hotel_ranking.tex. Stdlib only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
sys.path.insert(0, str(HERE.parent / "paper"))
from linefig import write_lines  # noqa: E402
from make_figures import HR_RUNGS, parse_hotel_ranking  # noqa: E402

if __name__ == "__main__":
    rows, fn03 = parse_hotel_ranking((HERE / "results_hotel_ranking.txt").read_text())
    xs = [r[0] for r in rows]
    series = [(n, xs, [r[2][n] for r in rows]) for n in HR_RUNGS]
    write_lines(HERE, "hotel_ranking.svg",
                "Which hull goes furthest as payload power grows: each rung against the monohull",
                f"Peak range of each rung over the 4 m monohull's, central cases, hotel load 1 W to 10 kW; "
                f"the monohull leads every rung up to 200 W, and its best speed passes Froude number 0.3 at about {fn03:.0f} W",
                "hotel load, W (log)", "range ratio rung/monohull (log)", series,
                logx=True, logy=True, hline=1.0, vline=[fn03], xticks=[1, 10, 100, 1000, 10000])

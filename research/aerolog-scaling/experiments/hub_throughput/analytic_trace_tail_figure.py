"""Write trace_tail_by_hour.svg: hourly share of orders waiting over 300 s, rule against simulator (milestone 6k).

    python3 analytic_trace_tail_figure.py

Numbers are parsed from the committed analytic_trace_tail_results.txt, never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "analytic_trace_tail_results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== Time of day", 0, [2, 3], sep="|")
    write_lines(HERE, "trace_tail_by_hour.svg",
                "Cargo-drone hub: share of orders waiting > 300 s by hour (Wed shape, 85% load)",
                "Line plot of the share of orders that wait more than 300 s for a charged pack, by hour of day; the exact "
                "time-varying rule and the simulator both stay near zero until the evening peak, then rise to about 0.2 "
                "at 22:00 as the pack backlog carries past the peak",
                "hour of day", "P(wait > 300 s)", [("time-varying rule", xs, ys[0]), ("simulator", xs, ys[1])])


if __name__ == "__main__":
    main()

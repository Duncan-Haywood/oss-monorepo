"""Write experiments/ratio.svg: annual bill against the peak/off-peak price ratio, from section B of results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "== B.", 0, [2, 3])      # row: ratio | thermostat_cost MPC_cost ...
    write_lines(HERE, "ratio.svg", "Heating and cooling bill against the peak/off-peak price ratio (Greensboro NC)",
                "Line plot: annual electricity bill in dollars for a PI thermostat and for a receding-horizon MPC with a wrong model and a "
                "yesterday's-weather forecast, against the peak to off-peak price ratio at a fixed mean price",
                "peak / off-peak price ratio", "annual bill ($)",
                [("thermostat 20/24", xs, ys[0]), ("MPC, wrong model, persistence forecast", xs, ys[1])])


if __name__ == "__main__":
    main()

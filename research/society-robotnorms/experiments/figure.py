"""Write experiments/crowd_tipping.svg and experiments/robot_cost.svg from results.txt.

    python3 experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
FIGS = [
    {'fname': 'crowd_tipping.svg', 'section': '== B.', 'ycols': [1, 2, 3, 4],
     'names': ['memory 5', 'memory 9', 'memory 17', 'memory 25'],
     'title': 'Share of people who adopt the robots’ passing side',
     'alt': 'Line plot of the final share of simulated people walking on the robots’ side against the share of committed robots, for human memories of 5, 9, 17 and 25 partners; each curve jumps from near 0 to 1 at a tipping share that grows with memory',
     'xlabel': 'share of committed robots in the crowd', 'ylabel': 'people on the robots’ side'},
    {'fname': 'robot_cost.svg', 'section': '== D.', 'ycols': [1, 2],
     'names': ['committed robots', 'adaptive robots'],
     'title': 'What a norm-shifting fleet costs people (memory 9)',
     'alt': 'Line plot of head-on conflicts per meeting for simulated people against robot share; with committed robots conflicts rise with the robot share until the crowd tips and then fall to the error floor; with adaptive robots they stay at the floor',
     'xlabel': 'share of robots in the crowd', 'ylabel': 'conflicts per human meeting'},
]


def main():
    for c in FIGS:
        xs, ys = table(TEXT, c["section"], 0, c["ycols"])
        series = list(zip(c["names"], [xs] * len(ys), ys))
        write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()

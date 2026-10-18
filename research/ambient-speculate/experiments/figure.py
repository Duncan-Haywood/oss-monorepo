"""Write experiments/latency_vs_start.svg: reply latency against the speculative start time S, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'latency_vs_start.svg', 'section': '== latency vs speculative start S', 'xcol': 0, 'ycols': [1, 2, 3],
       'names': ['hold until endpoint', 'eager (speak when ready)', 'no speculation'],
       'title': 'Reply latency vs speculative start time (hangover 1000 ms)',
       'alt': 'Line plot of median reply latency against the time after end of speech at which the reply pipeline starts: holding the reply until the endpoint is flat at about 1060 ms once the start is early enough, eager replies fall linearly, and no speculation stays at about 1740 ms',
       'xlabel': 'speculative start S after end of speech (ms)', 'ylabel': 'median reply latency (ms)'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"])
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], list(zip(c["names"], [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()

"""Write experiments/wait_vs_cue.svg: mean end-of-turn wait against cue quality d', parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'wait_vs_cue.svg', 'section': '== wait vs d, medium (median 250 ms), cut-off budget 10%', 'xcol': 0, 'ycols': [1, 2, 3],
       'names': ['q = 0 (all pauses mid-clause)', 'q = 0.25', 'q = 0.5'],
       'title': 'Mean wait at end of turn vs cue quality d (medium pauses, 10% cut-off budget; fixed hangover 913 ms)',
       'alt': 'Line plot of the mean silence an assistant waits before replying against the sentence-completeness cue quality d: with no cue the wait is about 915 ms, and it falls to about 67 ms at d = 4 when no pause sits at a complete point, to about 570 ms when a quarter of pauses do, and to about 750 ms when half do',
       'xlabel': 'cue quality d (separation of the two score distributions, in sd)', 'ylabel': 'mean wait at the real end (ms)'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"])
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], list(zip(c["names"], [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()

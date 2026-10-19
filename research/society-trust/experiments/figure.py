"""Write experiments/avoidance_trap.svg and experiments/recovery.svg from results.txt.

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
    {'fname': 'avoidance_trap.svg', 'section': '== G.', 'ycols': [1, 2, 3, 4],
     'names': ['gossip neutral', 'bad news counts 2×', 'bad news counts 4×', '4× with explained failures'],
     'title': 'Does the fleet’s reputation come back? (after a bad incident)',
     'alt': 'Line plot of final mean trust against the trust level below which people avoid robots; trust returns to about 0.9 when people avoid robots only below 0.25 but ends near 0.4 when they avoid below 0.4, while explained failures keep it near 0.97 throughout',
     'xlabel': 'trust below which people stop using robots', 'ylabel': 'mean trust at the end'},
    {'fname': 'recovery.svg', 'section': '== H.', 'ycols': [1, 2],
     'names': ['robots stay silent', 'robots explain failures'],
     'title': 'Mean trust through a bad incident (rounds 100–149)',
     'alt': 'Line plot of mean simulated trust over 800 rounds; both curves dip at the incident; with silent robots trust recovers only to about 0.87 because some people never return, with explaining robots it returns to about 0.98',
     'xlabel': 'round', 'ylabel': 'mean trust'},
]


def main():
    for c in FIGS:
        xs, ys = table(TEXT, c["section"], 0, c["ycols"])
        series = list(zip(c["names"], [xs] * len(ys), ys))
        write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()

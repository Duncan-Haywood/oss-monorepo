"""Write experiments/figure.svg: held-out AUROC per round, parsed from the committed results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE.parent / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "round", 0, [1, 2, 3])
    series = list(zip(["clean text", "attacked (fresh attack)", "attacked (stale round-0 edits)"], [xs] * len(ys), ys))
    write_lines(HERE, "figure.svg", "Refitting the detector against a black-box attacker: held-out AUROC by round",
                "Line plot of held-out AUROC for a refit word n-gram detector over four rounds: clean text falls from 0.948 to about 0.90, a fresh black-box attack stays near 0.81, round-0 edits near 0.85",
                "round (detector refit on attacked training texts)", "held-out AUROC", series)


if __name__ == "__main__":
    main()

"""Write experiments/capture.svg from results.txt (section F).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== F.", 0, [1, 2, 3, 4])
    names = ["analytic cells x cycles", "generic cells x cycles", "generic cells x cycles x depth", "random choice"]
    write_lines(HERE, "capture.svg", "Mappings needed to find the best SKY130 area x latency design",
                "Probability that the best design of a random pool of 20 is among the top k a screen ranks, for three screens and random choice; generic cells times cycles reaches 0.97 at k = 3",
                "k = designs mapped to SKY130", "P(best design of the pool is mapped)", list(zip(names, [xs] * 4, ys)))


if __name__ == "__main__":
    main()

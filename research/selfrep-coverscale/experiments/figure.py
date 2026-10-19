"""Write experiments/ratio_vs_n.svg from experiments/results.txt (overlap 0.5 rows).

    python experiments/figure.py

Mean value ratio to the exact optimum against the number of substitutions, for greedy, local search and
random search. Numbers are parsed from the committed run output. Standard library only.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    xs, g, ls, rs = [], [], [], []
    for line in (HERE / "results.txt").read_text().replace("%", " ").replace("(", " ").replace(")", " ").splitlines():
        p = line.split()
        if len(p) >= 10 and re.fullmatch(r"\d+", p[0]) and p[1] == "0.5":
            xs.append(float(p[0])); g.append(float(p[2])); ls.append(float(p[6])); rs.append(float(p[8]))
    if not xs:
        raise SystemExit("no overlap-0.5 rows parsed from results.txt")
    write_lines(HERE, "ratio_vs_n.svg", "Greedy vs local search vs random (64 evals), overlap 0.5",
                "Line plot of mean value as a percentage of the exact optimum against number of substitutions, for greedy, local search and random search",
                "number of substitutions n", "mean % of exact optimum",
                [("greedy", xs, g), ("local search", xs, ls), ("random 64", xs, rs)])


if __name__ == "__main__":
    main()

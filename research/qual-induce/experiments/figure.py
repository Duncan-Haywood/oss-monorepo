"""Write experiments/agreement.svg: NMI with the human primary emotion against the number of induced codes, with chance.

    python3 experiments/figure.py

Numbers are parsed from the committed results.txt; re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rows, on = {}, False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("== A."):
            on = True
        elif l.startswith("=="):
            on = False
        p = l.split()
        if on and len(p) == 7 and p[0] in ("nmf", "kmeans"):
            rows.setdefault(p[0], []).append((float(p[1]), float(p[2]), float(p[4])))
    ks = [r[0] for r in rows["nmf"]]
    chance = [sum(r[2] for r in (rows["nmf"][i], rows["kmeans"][i])) / 2 for i in range(len(ks))]
    write_lines(HERE, "agreement.svg", "Induced codes vs the human emotion label: NMI by number of codes",
                "Line plot: normalised mutual information between an induced code assignment and the human primary emotion, "
                "for NMF topics and k-means with 5 to 60 codes, and for a random assignment of the same sizes; both induced "
                "methods sit above chance, but the gap is about 0.1 to 0.15",
                "number of induced codes (k)", "NMI with human primary emotion",
                [("NMF topics", ks, [r[1] for r in rows["nmf"]]), ("k-means on LSA", ks, [r[1] for r in rows["kmeans"]]),
                 ("random, same sizes", ks, chance)], logx=True)


main()

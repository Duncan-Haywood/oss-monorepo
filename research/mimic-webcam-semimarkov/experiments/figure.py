"""Write experiments/semimarkov.svg: AUROC of semi-Markov and second-order chains against the number of states, from ../results/semimarkov.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

KS = (8, 32)


def main():
    rows = [l.split("\t") for l in (HERE.parent / "results" / "semimarkov.txt").read_text().splitlines()[1:]]
    pop = {r[0]: float(r[1]) for r in rows}
    series = [(f"{who} {kind}, {em} emission", [float(k) for k in KS], [pop[f"{who} {kind}{k} {em}"] for k in KS])
              for who in ("own", "pooled") for kind in ("semi", "order2") for em in ("centroid", "member")]
    write_lines(HERE, "semimarkov.svg", "Semi-Markov and second-order webcam-signal generators: AUROC against states",
                "Line plot of population-detector AUROC for semi-Markov and second-order chains over 8 and 32 quantised states, "
                "fitted on one person's earlier windows or on other people's; every line sits at or just under 1.000",
                "number of states k", "AUROC vs the person's later windows (0.5 = chance)",
                series, logx=True, logy=False, hline=0.5)


if __name__ == "__main__":
    main()

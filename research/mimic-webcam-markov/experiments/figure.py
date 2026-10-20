"""Write experiments/markov.svg: AUROC of Markov-chain generators against the number of states, from ../results/markov.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

KS = (8, 32, 128)


def main():
    rows = [l.split("\t") for l in (HERE.parent / "results" / "markov.txt").read_text().splitlines()[1:]]
    pop = {r[0]: float(r[1]) for r in rows}
    series = [(f"{who}, {em} emission", [float(k) for k in KS], [pop[f"{who} markov{k} {em}"] for k in KS])
              for who in ("own", "pooled") for em in ("centroid", "member")]
    write_lines(HERE, "markov.svg", "Markov-chain webcam-signal generators: AUROC against states",
                "Line plot of population-detector AUROC for Markov chains over 8, 32 and 128 quantised states, fitted on one "
                "person's earlier windows or on other people's, emitting state centres or real frames; every line sits at 1.000 "
                "except pooled 128-state member emission at 0.999",
                "number of states k", "AUROC vs the person's later windows (0.5 = chance)",
                series, logx=True, logy=False, hline=0.5)


if __name__ == "__main__":
    main()

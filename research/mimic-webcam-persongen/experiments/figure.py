"""Write experiments/persongen.svg: AUROC of own-person versus pooled copying generators, from ../results/persongen.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

KINDS = ("replay", "stitch50", "stitch50+match")


def main():
    rows = [l.split("\t") for l in (HERE.parent / "results" / "persongen.txt").read_text().splitlines()[1:]]
    pop = {r[0]: float(r[1]) for r in rows}
    aware = {r[0]: float(r[2]) for r in rows}
    xs = [1.0, 2.0, 3.0]
    series = [("own person, population detector", xs, [pop[f"own {k}"] for k in KINDS]),
              ("pooled people, population detector", xs, [pop[f"pooled {k}"] for k in KINDS]),
              ("pooled people, profile-aware detector", xs, [aware[f"pooled {k}"] for k in KINDS])]
    write_lines(HERE, "persongen.svg", "Copying one person versus copying everyone: AUROC",
                "Line plot of detector AUROC for three copying generators (1 whole-window replay, 2 50-frame stitch, "
                "3 50-frame join-matched stitch) drawn from the same person's earlier windows or from other people; "
                "own-person copies stay near 0.6, pooled copies reach 0.96 once the detector knows the person",
                "generator (1 replay, 2 stitch 50, 3 stitch 50 + match)", "AUROC vs the person's later windows (0.5 = chance)",
                series, logx=False, logy=False, hline=0.5)


if __name__ == "__main__":
    main()

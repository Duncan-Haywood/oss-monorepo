"""Write experiments/markov.svg: AUROC of single-feature-group detectors against the Markov generators, from ../results/diag.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rows = [l.split("\t") for l in (HERE.parent / "results" / "diag.txt").read_text().split("\n\n")[0].splitlines()[1:]]
    xs = [float(i + 1) for i in range(len(rows))]
    series = [("own markov frame", xs, [float(r[1]) for r in rows]),
              ("own markov gauss", xs, [float(r[2]) for r in rows])]
    names = ", ".join(f"{i + 1} {r[0]}" for i, r in enumerate(rows))
    write_lines(HERE, "markov.svg", "Each feature group alone gives the Markov generators away: AUROC",
                f"Line plot of AUROC of eight single-feature-group detectors ({names}) against a learned per-person Markov "
                "generator; every group is at 0.75 or above and most are near 1",
                "feature group (" + names + ")", "AUROC vs the person's later windows (0.5 = chance)",
                series, logx=False, logy=False, hline=0.5)


if __name__ == "__main__":
    main()

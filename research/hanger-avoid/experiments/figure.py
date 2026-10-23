"""Write experiments/avoid.svg: done per hour against grasp clearance, waiting vs avoiding, from results.txt.

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
    series = []
    for name in ("pinch", "see"):
        rows = [l.split() for l in TEXT[2:14] if l.startswith(name)]
        xs = [float(r[1]) for r in rows]
        series.append((name + ", wait", xs, [float(r[2]) for r in rows]))
        series.append((name + ", avoid", xs, [float(r[5]) for r in rows]))
    write_lines(HERE, "avoid.svg",
                "Does picking a free garment recover what blocking costs?",
                "Line plot of garments hung or folded per hour against the clearance two grippers need between grasps in metres, for blind pinching and for aiming, each waiting or avoiding: avoiding recovers about 10 per hour of pinching's loss at 0.15 and 0.30 m and about 2 for aiming",
                "clearance needed between two grasps (m, assumed)", "garments hung or folded per hour (two arms)", series)


if __name__ == "__main__":
    main()

"""Write experiments/paired.svg: paired gain from avoiding (done/h) against clearance, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    series = []
    for name in ("pinch", "sweep", "see"):
        rows = [l.split() for l in TEXT[2:] if l.startswith(name)]
        xs = [float(r[1]) for r in rows]
        series.append((name + ", gain", xs, [float(r[4]) for r in rows]))
    write_lines(HERE, "paired.svg",
                "What does picking a free garment gain, paired on the same loads?",
                "Line plot of the mean paired gain in garments hung or folded per hour from avoiding against the clearance in metres, for pinching, sweeping and aiming: pinching gains about 10 per hour at 0.15 and 0.30 m, sweeping about 4 at 0.30 and 0.45 m, aiming 0.2 to 2",
                "clearance needed between two grasps (m, assumed)", "paired gain, avoid minus wait (garments per hour)", series)


if __name__ == "__main__":
    main()

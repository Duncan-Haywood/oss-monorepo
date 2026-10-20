"""Write experiments/shrink_safe.svg: share of trials fed with peak lip force <= 2 N against the misjudgement, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    series = {}
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("#") or not l.strip() or l.startswith("design"):
            continue
        t = l.split()
        shrink = float(t[-6])
        if shrink == 0.5:
            continue
        name = ("blind arm" if t[0] == "open" else "camera arm") + (", constant error" if shrink == 0.0 else ", error shrinks to 0 at the lips")
        xs, ys = series.setdefault(name, ([], []))
        xs.append(float(t[-5])); ys.append(float(t[-3]))
    write_lines(HERE, "shrink_safe.svg", "Feeding arm, user leans at 100 mm/s: safe share vs misjudgement, constant or shrinking",
                "Line plot: share of feeds with peak lip force at most 2 N against the size of the user's misjudgement of the spoon, for a blind and a camera arm, with the error constant or shrinking to zero at the lips; shrinking keeps the blind arm near 0.7 to 1.0 where the constant error drops it to 0.41.",
                "std of user misjudgement far from the lips (mm)", "share fed with peak <= 2 N",
                [(k, v[0], v[1]) for k, v in series.items()])


if __name__ == "__main__":
    main()

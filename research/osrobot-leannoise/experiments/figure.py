"""Write experiments/bias_safe.svg: share of trials fed with peak lip force <= 2 N against the user's lean speed, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    series = {}
    on = False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("#"):
            on = "Lean 100 mm/s" in l
        elif on and l.strip() and not l.startswith("design"):
            t = l.split()
            if t[-6] != "0.00":   # perception delay 0 only
                continue
            name = "open loop" if t[0] == "open" else "camera"
            xs, ys = series.setdefault(name, ([], []))
            xs.append(float(t[-5])); ys.append(float(t[-3]))
    write_lines(HERE, "bias_safe.svg", "Feeding arm at 0.20 m/s, user leans at 100 mm/s: safe share vs misjudgement of the spoon",
                "Line plot: share of feeds with peak lip force at most 2 N against the size of the user's lateral misjudgement of the spoon position, for a blind arm and a camera arm; the blind arm falls from 1.0 to about 0.5, the camera arm from 0.97 to about 0.7.",
                "std of user misjudgement (mm)", "share fed with peak <= 2 N",
                [(k, v[0], v[1]) for k, v in series.items()])


if __name__ == "__main__":
    main()

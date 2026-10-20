"""Write experiments/lean_safe.svg: share of trials fed with peak lip force <= 2 N against the user's lean speed, parsed from results.txt.

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
            on = "30 mm" in l
        elif on and l.strip() and not l.startswith("design") and "0.20 m/s" in l:
            t = l.split()
            name = "open loop" if t[0] == "open" else "camera"
            lean, safe = float(t[-7]), float(t[-5])
            xs, ys = series.setdefault(name, ([], []))
            xs.append(lean); ys.append(safe)
    write_lines(HERE, "lean_safe.svg", "Feeding arm at 0.20 m/s, 30 mm sway: safe share vs user lean speed",
                "Line plot: share of feeds with peak lip force at most 2 N against the speed at which the user leans toward the spoon, for a blind arm and a camera arm; both rise toward 1.",
                "user lean speed (mm/s)", "share fed with peak <= 2 N",
                [(k, v[0], v[1]) for k, v in series.items()])


if __name__ == "__main__":
    main()

"""Write experiments/settling.svg, parsed from results.txt (section A, beta_r = 16 rows).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rows, on = [], False
    for ln in (HERE / "results.txt").read_text().splitlines():
        if ln.startswith("== "):
            on = ln.startswith("== A.")
        elif on and ln and not ln.startswith("#"):
            rows.append(ln.split())
    rows = [r for r in rows if r[1] == "16"]
    xs = [float(r[0]) for r in rows]
    write_lines(HERE, "settling.svg", "Learnrobots: where learning robots settle",
                "Line plot of the fleet's go probability against the collision cost k for robots with response sharpness 16: logit-QRE prediction and simulation",
                "collision cost k (waiting cost w = 1, dithering d = 1)", "robots' go probability",
                [("QRE prediction", xs, [float(r[2]) for r in rows]),
                 ("simulation (8 seeds)", xs, [float(r[3]) for r in rows])])


if __name__ == "__main__":
    main()

"""Write experiments/lip_stiffness.svg: peak lip force against lip stiffness, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()


def main():
    xs, ys = table(TEXT, "# Sweep 1", 1, [5, 6])
    write_lines(HERE, "lip_stiffness.svg", "Peak lip force against lip stiffness (camera arm, 0.20 m/s, 30 mm sway)",
                "Line plot of mean and worst peak lip force in newtons against lip stiffness from 100 to 6400 N/m; both rise with stiffness",
                "lip stiffness K_LIP (N/m)", "peak lip force (N)",
                [("mean peak", xs, ys[0]), ("worst peak", xs, ys[1])], logx=True)


if __name__ == "__main__":
    main()

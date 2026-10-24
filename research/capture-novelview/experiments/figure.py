"""Write experiments/baseline.svg: synthesised-view PSNR against the gap between source cameras, parsed from results.txt.

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
    xs, ys = table(TEXT, "== A.", 0, [1, 2])
    if len(xs) < 5:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "baseline.svg", "Novel-view quality against the gap between source cameras",
                "Line plot: PSNR of the synthesised midpoint view and of simply using the nearest camera, against the angle between the two source cameras",
                "gap between the two source cameras (deg)", "PSNR against ray-traced truth (dB)",
                [("nearest camera, no synthesis", xs, ys[0]), ("depth warp of both neighbours", xs, ys[1])], logx=True, logy=False)


if __name__ == "__main__":
    main()

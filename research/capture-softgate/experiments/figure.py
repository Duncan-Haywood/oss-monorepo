"""Write experiments/gap.svg: novel-view PSNR against the gap between source cameras, per repair strategy, parsed from results.txt.

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
    xs, ys = table(TEXT, "== B.", 1, [2, 3, 4, 8])
    if len(xs) < 3:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "gap.svg", "Soft against hard confidence gating of stereo-depth view synthesis, against camera gap",
                "Line plot: PSNR of the synthesised view with background hole filling, with a hard disagreement gate, with a soft disagreement weight, and of the nearest camera alone, against the angle between the two source cameras in degrees",
                "gap between source cameras (degrees)", "PSNR against ray-traced truth (dB)",
                [("hole fill", xs, ys[0]), ("hard gate", xs, ys[1]),
                 ("soft gate", xs, ys[2]), ("nearest camera, no synthesis", xs, ys[3])], logx=False, logy=False)


if __name__ == "__main__":
    main()

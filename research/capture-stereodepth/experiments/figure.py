"""Write experiments/baseline.svg: novel-view PSNR against stereo baseline, parsed from results.txt.

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
    xs, ys = table(TEXT, "== A.", 0, [5, 6, 7, 8])
    if len(xs) < 5:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "baseline.svg", "Novel-view quality with depth measured by stereo, against stereo baseline",
                "Line plot: PSNR of the synthesised view using measured stereo depth, exact depth, assumed independent depth noise with the same mean error, and the nearest camera, against the stereo baseline in metres",
                "stereo baseline (m)", "PSNR against ray-traced truth (dB)",
                [("measured stereo depth", xs, ys[0]), ("exact depth (oracle)", xs, ys[1]),
                 ("assumed iid noise, same mean error", xs, ys[2]), ("nearest camera, no synthesis", xs, ys[3])], logx=True, logy=False)


if __name__ == "__main__":
    main()

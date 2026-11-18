"""Write proxy_detection.svg: share of 20-step segments caught (zoned fp16 referee, float32 arbiter) against the share
of the segment's compute a sub-batch forger saves on its last step, warmup-cosine schedule, one line per optimiser.

    python3 figure.py

Numbers are parsed from the committed results.txt (analyze.py), never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== Figure table", 0, [1, 2, 3, 4])
    keep = [i for i, x in enumerate(xs) if x > 0]  # log axis: drop b = 64 (saves nothing, is the honest step)
    xs = [xs[i] for i in keep]
    ys = [[y[i] for i in keep] for y in ys]
    names = ["plain SGD, weights checked", "momentum, weights or first moment", "Adam 1e-3, weights or moments",
             "Adam 4e-3, weights or moments"]
    write_lines(HERE, "proxy_detection.svg",
                "A sub-batch forger is caught unless it saves almost nothing (one forged step of 20, warmup-cosine, 40 seeds)",
                "Line plot of the share of segments caught against the share of the segment's compute the forger saves by"
                " computing its last step's gradient on b of 64 rows, for plain SGD, momentum and two Adam rates under"
                " warmup-cosine; values are in results.txt",
                "compute saved, % of the segment", "share of segments caught", list(zip(names, [xs] * 4, ys)), logx=True)


if __name__ == "__main__":
    main()

"""Write precision_detection.svg: share of 20-step segments caught against the number of final steps a forger computes
at low precision, warmup-cosine schedule: float16 (the referee's own recipe, two-sided zoned referee) and bfloat16
(upper zoned referee), one line per optimiser.

    python3 figure.py

Numbers are parsed from the committed results.txt (analyze.py), never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== Figure table", 0, [1, 2, 3, 4, 5, 6, 7, 8])
    names = ["float16, plain SGD", "float16, momentum", "float16, Adam 1e-3", "float16, Adam 4e-3",
             "bfloat16, plain SGD", "bfloat16, momentum", "bfloat16, Adam 1e-3", "bfloat16, Adam 4e-3"]
    write_lines(HERE, "precision_detection.svg",
                "Low-precision forgeries of a segment's last steps (warmup-cosine, 40 seeds, 3,000 segments per line)",
                "Line plot of the share of segments caught by the replay referee and float32 arbiter against how many of a"
                " segment's last 20 steps the forger computes at float16 or bfloat16, for plain SGD, momentum and two Adam"
                " rates under warmup-cosine; values are in results.txt",
                "forged steps of 20 (log scale)", "share of segments caught", list(zip(names, [xs] * 8, ys)), logx=True)


if __name__ == "__main__":
    main()

"""Write arbiter_audit.svg: share of 20-step segments caught against the number of final steps a forger computes in
float16, warmup-cosine schedule, fresh test seeds: the two-stage audit (fp16 referee, then float32 arbiter) and the
zoned float32 arbiter run on every segment, one line per optimiser.

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
    names = ["two-stage, plain SGD", "two-stage, momentum", "two-stage, Adam 1e-3", "two-stage, Adam 4e-3",
             "arbiter-only, plain SGD", "arbiter-only, momentum", "arbiter-only, Adam 1e-3", "arbiter-only, Adam 4e-3"]
    write_lines(HERE, "arbiter_audit.svg",
                "Float16 forgeries of a segment's last steps: two-stage audit against the float32 arbiter alone"
                " (warmup-cosine, fresh seeds, 3,000 segments per line)",
                "Line plot of the share of segments caught against how many of a segment's last 20 steps the forger"
                " computes in float16, for the two-stage audit and the zoned float32 arbiter alone, plain SGD, momentum"
                " and two Adam rates under warmup-cosine; values are in results.txt",
                "forged float16 steps of 20 (log scale)", "share of segments caught", list(zip(names, [xs] * 8, ys)),
                logx=True)


if __name__ == "__main__":
    main()

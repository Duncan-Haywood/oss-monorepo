"""Write forgery_detection.svg: share of 20-step segments caught (flagged by the fp16 replay referee and convicted by
the float32 arbiter) against how many of the segment's 20 steps the worker skipped and forged, Adam at mean learning
rate 4e-3 under warmup-cosine.

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
    names = ["naive skip, weights checked", "coast forgery, weights checked", "coast forgery, weights or first moment",
             "coast forgery, weights or either moment"]
    write_lines(HERE, "forgery_detection.svg",
                "A zero-gradient forgery hides skipped steps from a weight check, not from a moment check (Adam, 40 seeds)",
                "Line plot of the share of segments caught against the number of the segment's 20 steps skipped and"
                " forged, Adam at mean learning rate 4e-3 under warmup-cosine. Checking weights alone, the coast forgery"
                " is caught in 1% of segments at 2 skipped steps against 30% for a naive skip; checking the first moment"
                " as well catches it in 80% at 1 step and 95% at 2, and adding the second moment 86% and 99%",
                "steps skipped out of 20", "share of segments caught", list(zip(names, [xs] * 4, ys)), logx=True)


if __name__ == "__main__":
    main()

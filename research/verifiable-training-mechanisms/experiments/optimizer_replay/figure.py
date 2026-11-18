"""Write replay_detection.svg: share of 20-step segments both flagged by the fp16 replay referee and convicted by the
float32 arbiter, against how many of the segment's 20 steps the worker skipped, per optimiser (warmup-cosine).

    python3 figure.py

Numbers are parsed from the committed results.txt (analyze.py), never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== Figure table", 0, [1, 2, 3, 4, 5])
    names = ["plain SGD", "momentum 0.9", "Adam, mean lr 1e-3", "Adam, mean lr 4e-3",
             "Adam 4e-3, weights or moment checked"]
    write_lines(HERE, "replay_detection.svg",
                "Replay catches a full stall under every optimiser; Adam hides a few skipped steps (40 seeds)",
                "Line plot of the share of segments caught against the number of the segment's 20 steps skipped, under"
                " warmup-cosine. Every optimiser is caught at 20 skipped steps. Plain SGD is caught from 1 skipped step,"
                " momentum from 2, Adam only from 5 on the weight check; adding a first-moment check catches Adam from"
                " 2 skipped steps",
                "steps skipped out of 20", "share of segments caught", list(zip(names, [xs] * 5, ys)), logx=True)


if __name__ == "__main__":
    main()

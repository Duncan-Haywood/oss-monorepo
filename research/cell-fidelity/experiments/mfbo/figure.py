"""Write experiments/mfbo/mfbo.svg: median time to a design within 1% of the DFN best against pool size,
for GP-EI, the best whole-pool screen and the best co-kriging search with its planned and cheap start.

    python experiments/mfbo/figure.py

Numbers are parsed from the committed results.txt (section F), never retyped: re-run run.py first if it changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    head = next(l for l in TEXT if l.startswith("pool ["))
    cols = [c.rstrip("]") for c in head.split("[")[1:]]
    xs, ys = table(TEXT, "F.", 0, [1, 2, 3, 4])
    names = ["GP-EI on DFN@100", "SPM@100 screen (best screen at 64-96)", cols[2] + " (planned start)", cols[3]]
    write_lines(HERE, "mfbo.svg", "Co-kriging multi-fidelity search against screens and GP-EI, by pool size",
                "Line plot of median charged wall time to reach within 1% of the best 100-cycle DFN design against "
                "candidate-pool size: co-kriging with five random full-model starts is slowest, the same search started from cheap runs "
                "stays close to the best screen at every size and beats GP-EI",
                "designs in the candidate pool", "median seconds to within 1% (30 seeds)",
                list(zip(names, [xs] * 4, ys)))


if __name__ == "__main__":
    main()

"""Write experiments/bystanders.svg: test PSNR against the number of bystanders for the hard gate, soft gate and learned gate, parsed from results.txt.

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
    xs, ys = table(TEXT, "== E.", 0, [2, 3, 4])
    if len(xs) < 3:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "bystanders.svg", "Learned against hand-set confidence gates, by number of bystanders",
                "Line plot: mean PSNR on 40 held-out scene configurations of the hard disagreement gate, the soft disagreement gate and the learned per-pixel weight, against the number of bystanders in the scene (0, 1 or 2)",
                "bystanders in the scene", "PSNR against ray-traced truth (dB)",
                [("hard gate", xs, ys[0]), ("soft gate", xs, ys[1]), ("learned weight (MLP)", xs, ys[2])], logx=False, logy=False)


if __name__ == "__main__":
    main()

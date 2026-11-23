"""Write compensated_arbiter.svg: on the fresh seeds 400 to 439, the conviction rate of one forged float16 step in
each plain-SGD cell's least-convicted zone, for plain float32 SGD (milestone 91's statistic), Kahan-compensated SGD
compared on its weights alone, and Kahan-compensated SGD compared on its compensated weights w - c.

    python3 figure.py

Numbers are parsed from the committed results.txt (analyze.py), never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_bars  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    cats, ys = table(TEXT, "== Figure table", 0, [1, 2, 3], xtext=True)
    labels = [f"SGD {c}" for c in cats]
    write_bars(HERE, "compensated_arbiter.svg",
               "Worst-zone conviction of one forged float16 step under plain SGD, fresh seeds (200 segments per zone)",
               "Horizontal bar chart, one row per learning-rate schedule: share of segments convicted in the"
               " least-convicted zone by the float32 arbiter, for plain SGD, Kahan-compensated SGD compared on weights"
               " only, and Kahan-compensated SGD compared on compensated weights; values are in results.txt",
               "share convicted in the worst zone", labels,
               [("plain SGD, weights (milestone 91)", ys[0]),
                ("Kahan SGD, weights only", ys[1]),
                ("Kahan SGD, weights minus compensation", ys[2])], fmt="{:.2f}")


if __name__ == "__main__":
    main()

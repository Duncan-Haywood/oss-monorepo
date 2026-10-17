"""Write experiments/chime_mask.svg: high-urgency utility vs chime masking, one tone against up to four.

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
    xs, ys = table(TEXT, "6. Mean utility vs chime_mask", 0, [1, 2])
    series = list(zip(["one tone or plain glance", "best of 0 to 4 tones"], [xs] * len(ys), ys))
    write_lines(HERE, "chime_mask.svg", "Repeated tones: high-urgency utility vs tone masking (stylised)",
                "Line plot of mean utility for high-urgency messages against the chance a tone is missed in noise; the line allowing up to four tones matches the one-tone line at no masking and sits above it otherwise, widest at moderate masking",
                "chime_mask (P tone missed = chime_mask x noise)", "mean utility per message", series)


if __name__ == "__main__":
    main()

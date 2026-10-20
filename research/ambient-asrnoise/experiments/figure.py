"""Write experiments/recall_vs_wer.svg: recall at equal annoyance against ASR word error rate, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    w, wake, text, ac = [], [], [], []
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"wer ([\d.]+): wake recall ([\d.]+) .*text-threshold recall ([\d.]+) .*acoustic recall ([\d.]+) ", l)
        if m:
            w.append(float(m[1])); wake.append(float(m[2])); text.append(float(m[3])); ac.append(float(m[4]))
    if len(w) != 6:
        raise SystemExit("expected 6 wer rows, parsed %d" % len(w))
    write_lines(HERE, "recall_vs_wer.svg", "Recall at 2 false interruptions per hour vs ASR word error rate",
                "Line plot of recall against word error rate for a wake phrase, a transcript-score threshold and an acoustic-score threshold; the transcript policy falls to the acoustic one near a word error rate of 0.5",
                "ASR word error rate", "recall",
                [("wake phrase", w, wake), ("transcript threshold", w, text), ("acoustic threshold", w, ac)])


if __name__ == "__main__":
    main()

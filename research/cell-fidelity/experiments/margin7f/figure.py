"""Write margin7f.svg: held-out folds met (of 12) against held-out DFN cycles per design, for each rule at zero
margin and with the nested leave-one-pool-out margin (a two-point line per rule). From summary.json.

    python experiments/margin7f/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

S = json.loads((HERE / "summary.json").read_text())["summary"]
NAMES = dict(theta="threshold on drift score", F="flag fraction", FD="fraction + delta", U="uniform run length")


def main():
    series = [(NAMES[r], [S[r + "0"]["cycles"], S[r]["cycles"]], [S[r + "0"]["met"], S[r]["met"]]) for r in NAMES]
    write_lines(HERE, "margin7f.svg", "cell-fidelity 7f: held-out hits against DFN cycles",
                "Each rule's two points: zero margin (left, cheaper) and the margin chosen by nested "
                "leave-one-pool-out. With the margin, triage by threshold or by fraction meets the held-out tail "
                "target in 9 and 10 of 12 folds at 40 DFN cycles per design; the uniform rule needs all 50.",
                "held-out DFN cycles per design", "folds meeting the target (of 12)", series)


if __name__ == "__main__":
    main()

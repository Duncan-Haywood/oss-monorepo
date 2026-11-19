"""Write fresh7g.svg: folds meeting the tail target (share) against DFN cycles per design, for each rule, on 7f's
held-out pools (left point of each pair is 7f) and on the fourth fresh pool (7g, frozen policies). From the two
summary.json files.

    python experiments/fresh7g/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

S7 = json.loads((HERE.parent / "margin7f" / "summary.json").read_text())["summary"]
S = json.loads((HERE / "summary.json").read_text())["summary"]["frozen"]
NAMES = dict(theta="threshold on drift score", F="flag fraction", FD="fraction + delta", U="uniform run length")


def main():
    series = [(NAMES[r], [S7[r]["cycles"], S[r]["cycles"]], [S7[r]["met"] / 12, S[r]["met"] / 12]) for r in NAMES]
    write_lines(HERE, "fresh7g.svg", "cell-fidelity 7g: the triage rules on 32 never-simulated designs",
                "Each rule's two points: 7f's held-out pools (reused) and the same 12 policies, frozen, on a fourth "
                "fresh DFN pool. Threshold and fraction both meet the tail target in 9 of 12 at 41.7 and 40.5 "
                "cycles per design (17% and 19% saved against all-50); fraction + delta collapses to 5 of 12.",
                "DFN cycles per design", "share of policies meeting the target", series)


if __name__ == "__main__":
    main()

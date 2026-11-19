"""Write fresh7h.svg: share of folds meeting the tail target against DFN cycles per design, per rule, refit on four
pools and scored on the fifth fresh pool (left point) and over the 20 leave-one-pool-out folds of all five pools
(right point). From summary.json.

    python experiments/fresh7h/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

S = json.loads((HERE / "summary.json").read_text())["summary"]
NAMES = dict(R50="relative threshold, K1 = 50", theta50="absolute threshold, K1 = 50",
             theta="absolute threshold, K1 free", F="flag fraction", U="uniform run length")


def main():
    series = [(NAMES[r], [S["refit"][r]["cycles"], S["lopo5"][r]["cycles"]],
               [S["refit"][r]["met"] / S["refit"][r]["n"], S["lopo5"][r]["met"] / S["lopo5"][r]["n"]]) for r in NAMES]
    R, L = S["refit"]["R50"], S["lopo5"]["R50"]
    write_lines(HERE, "fresh7h.svg", "cell-fidelity 7h: triage rules on a fifth fresh DFN pool",
                f"Each rule's two points: refit on four pools and scored once on 64 never-simulated designs (4 sets), "
                f"and leave-one-pool-out over all five pools (20 folds). The relative threshold meets {R['met']} of 4 "
                f"at {R['cycles']:.1f} cycles and {L['met']} of 20 at {L['cycles']:.1f}.",
                "DFN cycles per design", "share of folds meeting the target", series)


if __name__ == "__main__":
    main()

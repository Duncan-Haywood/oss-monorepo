"""Write frontier7e.svg: DFN cycles per design needed to meet each tail-error target, for uniform run lengths,
drift-score triage and random triage (best extension length per target, chosen in hindsight within the set).
From summary.json (re-run run.py report first if the experiment changes).

    python experiments/frontier7e/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

D = json.loads((HERE / "summary.json").read_text())
S, TS = D["sets"], D["targets"]


def main():
    series = []
    for st in ("Chen2020", "NCA_Kim2011"):
        cv = S[st]["curves"]
        for k, lab in (("uniform", "uniform run length"), ("S_C", "drift-score triage"), ("random", "random triage")):
            series.append((f"{st} {lab}", TS, cv[k]["cost"]))
    write_lines(HERE, "frontier7e.svg", "cell-fidelity 7e: DFN cycles to meet a tail-error target",
                "Least DFN cycles per design whose policy brings the upper-quartile cycle-99 lithium-loss error to t "
                "times the all-50 figure, chosen in hindsight within the set. Drift-score triage is cheaper than any "
                "uniform run length at almost every target; the choice did not transfer across design pools.",
                "target t (x all-50 q75)", "DFN cycles per design", series)


if __name__ == "__main__":
    main()

"""Write triage7d.svg: the real ten-cycle forecast's upper-quartile error against the DFN cycles spent per design,
when the designs a ten-cycle drift score flags (or random designs) are simulated on to cycle 50. From summary.json
(re-run run.py report first if the experiment changes).

    python experiments/triage7d/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

S = json.loads((HERE / "summary.json").read_text())["sets"]
GRID = [i / 20 for i in range(21)]


def main():
    series = []
    for st in ("Chen2020", "OKane2022", "NCA_Kim2011"):
        cv = S[st]["000"]["curves"]
        for k, lab in (("S_C", "flagged by drift score"), ("random", "random flags")):
            series.append((f"{st} {lab}", [10 + 40 * f for f in GRID], [100 * v for v in cv[k]]))
    write_lines(HERE, "triage7d.svg", "cell-fidelity 7d: extend only the flagged designs to cycle 50",
                "Upper-quartile cycle-99 lithium-loss forecast error against mean DFN cycles per design. Flagging by "
                "the ten-cycle drift score reaches the tail target with fewer cycles than random flags on Chen2020 "
                "and NCA_Kim2011; on OKane2022 neither saves cycles.",
                "DFN cycles per design (mean)", "q75 error at cycle 99 (%)", series)


if __name__ == "__main__":
    main()

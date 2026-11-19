"""Write lawfloor.svg: the forecast error at cycle 99 against the law's line window, the real ten-cycle forecast
(e_000) and the all-measured floor (e_111), from summary.json (re-run run.py report first if the experiment changes).

    python experiments/lawfloor/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

S = json.loads((HERE / "summary.json").read_text())["sets"]


def main():
    series = []
    for st in ("OKane2022", "Chen2020", "Ai2020"):
        for cell, lab in (("000", "forecast"), ("111", "all measured")):
            d = S[st]["eL"][cell]
            ks = sorted(d, key=int)
            series.append((f"{st} {lab}", [int(k) for k in ks], [100 * d[k] for k in ks]))
    write_lines(HERE, "lawfloor.svg", "cell-fidelity 7b: longer windows fix the inputs, not the law, on LG M50",
                "Set-median cycle-99 lithium-loss error against the number of cycles the law's line is fitted on. "
                "The real forecast falls from 5.6-6.7% to 2.1-2.7% on the LG M50 sets, while the all-measured floor "
                "stays at 1.4-2.4%; on Ai2020 the floor falls from 8.3% to 2.0%.",
                "cycles in the law's line window (k)", "set-median error at cycle 99 (%)", series)


if __name__ == "__main__":
    main()

"""Write experiments/rangeline/rangeline.svg: set-median cycle-99 lithium-loss forecast error on 32 more fresh designs (5zz),
uniform lever NS, thickness lines NL40, NL, the range-restricted NR and the measured-OCP ceiling C, from the committed summary.json
(never retyped).

    python experiments/freshnode/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_bars  # noqa: E402

KEYS = (("NS", "uniform lever NS"), ("NL40", "line on 40 designs NL40"), ("NL", "line on 72 designs NL"),
        ("NR", "line in range, else NS (NR)"), ("C", "measured-OCP ceiling C"))


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    cats = list(S)
    series = [(lab, [100 * S[s]["e"][k] for s in cats]) for k, lab in KEYS]
    write_bars(HERE, "rangeline.svg", "Ten-cycle forecast error, second fresh pool of 32 DFN designs (set medians, %)",
               "Bar chart, one row per PyBaMM parameter set, of the set-median error of the cycle-99 lithium-loss "
               "forecast made from ten cycles, on 8 designs per set never used to fit the thickness line: "
               + "; ".join(f"{s} " + ", ".join(f"{k} {100 * S[s]['e'][k]:.1f}%" for k, _ in KEYS) for s in cats) + ".",
               "forecast error at cycle 99 (%)", cats, series, fmt="{:.1f}")


if __name__ == "__main__":
    main()

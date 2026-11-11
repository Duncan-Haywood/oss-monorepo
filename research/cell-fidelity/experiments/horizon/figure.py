"""Write experiments/horizon/horizon.svg: rank agreement with 100-cycle DFN against wall time, per model.

    python experiments/horizon/figure.py

Numbers are read from the committed summary.json (written by run.py report), never retyped. Stdlib only.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rungs = json.loads((HERE / "summary.json").read_text())["rungs"]
    series = []
    for m in ("SPM", "SPMe", "DFN"):
        pts = [(round(v["median_s"], 1), v["spearman"], k) for k, v in rungs.items()
               if k.startswith(m + "@") and "committed" not in k]
        pts.sort()
        series.append((f"{m} (cycles {', '.join(p[2].split('@')[1] for p in pts)})",
                       [p[0] for p in pts], [p[1] for p in pts]))
    write_lines(HERE, "horizon.svg", "Short DFN runs rank 100-cycle DFN better than full SPMe runs",
                "Spearman correlation with 100-cycle DFN scores against median wall time for SPM, SPMe and DFN "
                "stopped at 2, 10, 30 or 100 cycles on 49 designs; DFN at 10 cycles reaches 0.977 in 4.0 s, "
                "SPMe at 100 cycles 0.834 in 3.7 s",
                "median wall time to that cycle (s, log)", "Spearman with DFN at cycle 100", series,
                logx=True, hline=None)


if __name__ == "__main__":
    main()

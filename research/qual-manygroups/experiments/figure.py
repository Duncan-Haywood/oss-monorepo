"""Write experiments/all_cover_k6.svg: share of audit draws in which all six group intervals cover at once, by audit size,
design and adjustment, parsed from results.txt (K6.*.all, mean over four coders).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

text = (HERE / "results.txt").read_text()
xs, none = table(text, "K6.none.all", 0, [1, 2])
_, bonf = table(text, "K6.bonferroni.all", 0, [1, 2])
series = [("random audit, 95% intervals", none[0]), ("equal per group, 95% intervals", none[1]),
          ("random audit, Bonferroni", bonf[0]), ("equal per group, Bonferroni", bonf[1])]
write_lines(HERE, "all_cover_k6.svg", "Chance that all six group intervals cover the truth at once, by audit size",
            "Line plot: with six groups and 95% intervals only 64 to 77% of 120-item audits cover every group; equal numbers per "
            "group with a Bonferroni adjustment reach 89%, and both adjustments approach 100% at 1,920 items",
            "hand-coded items in the audit", "share of draws with all six intervals covering", [(n, xs, y) for n, y in series],
            logx=True, logy=False)

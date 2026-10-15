"""Write experiments/penalty_gain.svg: on/off minus proportional held-out cost (incl. penalty) against the per-swing penalty, "ours", held-out between rooms, lags 5 and 10 min, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped. The bar-chart helper is reused from garment-twonodelag.
"""
import importlib.util, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("lagfig", HERE.parent.parent / "garment-twonodelag" / "experiments" / "figure.py")
lagfig = importlib.util.module_from_spec(spec); spec.loader.exec_module(lagfig)

vals, ours = {}, False
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("== choice set"):
        ours = "ours" in l
    m = re.match(r"\s*(\d+)\s+(\d\.\d{3}) \|.*\| ([+-]\d\.\d{3}) [+-]\d\.\d{3}$", l)
    if ours and m and int(m.group(1)) in (5, 10):
        vals.setdefault(int(m.group(1)), []).append(-float(m.group(3)))
assert all(x >= 0 for v in vals.values() for x in v), "bars_svg draws non-negative values only"
assert set(vals) == {5, 10} and all(len(v) == 5 for v in vals.values()), vals
(HERE / "penalty_gain.svg").write_text(lagfig.bars_svg(
    "On/off minus proportional cost, held-out between rooms (ours)",
    "Bars: difference in cost (positive = proportional better) at per-swing penalties 0, 0.003, 0.01, 0.03, 0.1 C",
    "cost saved by proportional (C)", ["0", "0.003", "0.01", "0.03", "0.1"],
    [("lag 5 min", vals[5]), ("lag 10 min", vals[10])]))

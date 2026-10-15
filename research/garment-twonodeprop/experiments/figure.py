"""Write experiments/softness_cost.svg: extra held-out (outside rooms) discomfort when the proportional band is forced to be at least W wide, "ours" choice set, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped. The bar-chart helper is reused from garment-twonodelag.
"""
import importlib.util, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("lagfig", HERE.parent.parent / "garment-twonodelag" / "experiments" / "figure.py")
lagfig = importlib.util.module_from_spec(spec); spec.loader.exec_module(lagfig)

vals = {}
for l in (HERE / "results.txt").read_text().splitlines():
    m = re.match(r"\s*ours lag\s+(\d+):(.*)", l)
    if m:
        vals[int(m.group(1))] = [float(x) for x in re.findall(r"[+-]\d\.\d{3}/([+-]\d\.\d{3})", m.group(2))]
assert set(vals) == {0, 10} and all(len(v) == 3 for v in vals.values()), vals
(HERE / "softness_cost.svg").write_text(lagfig.bars_svg(
    "Cost of a softer gate (held-out outside rooms, ours)",
    "Bars: extra discomfort proxy when the proportional band is at least 0.6, 1.4 or 3.0 C wide, at lag 0 and 10 min",
    "extra discomfort proxy (C)", ["width >= 0.6 C", "width >= 1.4 C", "width >= 3.0 C"],
    [("lag 0 min", vals[0]), ("lag 10 min", vals[10])]))

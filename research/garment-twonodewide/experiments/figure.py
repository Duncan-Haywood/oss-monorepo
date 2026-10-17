"""Write experiments/wide_gain.svg: on/off minus proportional held-out cost for rooms 21 and 27 C (outside the narrow training range, inside the wide one), by training set and penalty, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped. The bar-chart helper is reused from garment-twonodelag.
"""
import collections, importlib.util, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("lagfig", HERE.parent.parent / "garment-twonodelag" / "experiments" / "figure.py")
lagfig = importlib.util.module_from_spec(spec); spec.loader.exec_module(lagfig)

acc = collections.defaultdict(list)
for l in (HERE / "results.txt").read_text().splitlines():
    m = re.match(r"\s*\d+\s+(0\.\d\d)\s+(narrow|wide)\s+\|\s*([+-]\d\.\d{3})\s*\|\s*([+-]\d\.\d{3})\s*\|", l)
    if m:
        acc[(m.group(2), m.group(1))].append(-float(m.group(4)))
mean = {k: sum(v) / len(v) for k, v in acc.items()}
assert all(len(v) == 8 for v in acc.values()) and len(acc) == 4, acc
assert all(x >= 0 for x in mean.values()), "bars_svg draws non-negative values only"
(HERE / "wide_gain.svg").write_text(lagfig.bars_svg(
    "On/off minus proportional cost, held-out rooms 21 and 27 C",
    "Bars: mean over 8 (choice set, lag) cases; positive = proportional better; penalties 0.01 and 0.1 C per swing",
    "cost saved by proportional (C)", ["0.01", "0.1"],
    [("tuned on 22-26 C", [mean[("narrow", "0.01")], mean[("narrow", "0.10")]]),
     ("tuned on 20-28 C", [mean[("wide", "0.01")], mean[("wide", "0.10")]])]))

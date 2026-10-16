"""Write experiments/person_gap.svg: mean extra held-out cost of the baseline-tuned gate over a gate retuned for the group, per group, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped. The bar-chart helper is reused from garment-twonodelag.
"""
import importlib.util, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("lagfig", HERE.parent.parent / "garment-twonodelag" / "experiments" / "figure.py")
lagfig = importlib.util.module_from_spec(spec); spec.loader.exec_module(lagfig)

rows = []
for l in (HERE / "results.txt").read_text().splitlines():
    m = re.match(r"(.+?)\s+proportional wins \d+ of 8; mean gap onoff (\d\.\d{3}), prop (\d\.\d{3});", l)
    if m:
        rows.append((m.group(1), float(m.group(2)), float(m.group(3))))
assert len(rows) == 6, rows
short = [r[0].replace(" person", "").replace(", 1.6 m", "").replace(", 1.85 m", "").replace("large and heavy 95 kg, 0.8 clo", "95 kg + 0.8 clo") for r in rows]
(HERE / "person_gap.svg").write_text(lagfig.bars_svg(
    "Cost of not retuning the gate for a new person or clothing level",
    "Bars: mean over 8 cells of (baseline-tuned cost minus cost of a gate retuned on that group); lower = tuning transfers",
    "extra cost (C)", short,
    [("on/off", [r[1] for r in rows]), ("proportional", [r[2] for r in rows])]))

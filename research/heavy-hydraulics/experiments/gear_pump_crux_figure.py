"""Figure for milestone 6n: share of geometries where a smaller fixed pump wins, against the fixed gear pump's
overall efficiency at 150 bar (index 2: at 85 L/min of 20 bar flow), for both makers' c sweeps.

Reads gear_pump_crux_results.txt (numbers are never retyped). Stdlib only.
Usage: python3 gear_pump_crux_figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

text = (HERE / "gear_pump_crux_results.txt").read_text()
series = []
for name, label in (("casappa: c sweep", "Casappa KAPPA 30"), ("danfoss: c sweep", "Danfoss SNP3"),
                    ("danfoss, casappa idle: c sweep", "Danfoss, Casappa idle")):
    _, (share, e2) = table(text, name, 0, [1, 3])
    series.append((label, e2, share))
write_lines(HERE, "gear_pump_crux.svg",
            "Excavator: where a smaller fixed gear pump beats load-sensing",
            "Share of 384 excavator geometries in which a smaller fixed pump beats load-sensing on fuel, against "
            "the fixed gear pump's overall efficiency at 150 bar and 85 L/min, for Casappa and Danfoss curves "
            "scaled by a factor c; both cross 50% near 0.83",
            "fixed gear pump overall efficiency at 150 bar, 2100 r/min, 85 L/min",
            "geometries where a smaller fixed pump wins (%)", series, hline=50)

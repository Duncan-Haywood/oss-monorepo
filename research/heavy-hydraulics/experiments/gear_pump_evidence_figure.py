"""Figure for milestone 6r: three gear-pump makers' scaled break-even sweeps and the pooled logistic
curve, on one efficiency axis (index 2: overall efficiency at 150 bar, 2100 r/min, 85 L/min).

Sweep points are parsed from the committed results files by gear_pump_evidence.py's readers; the
pooled E50 and w are parsed from gear_pump_evidence_results.txt (numbers are never retyped). Stdlib only.
Usage: python3 gear_pump_evidence_figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
sys.path.insert(0, str(HERE))
from linefig import write_lines  # noqa: E402
import gear_pump_evidence as ge  # noqa: E402

res = (HERE / "gear_pump_evidence_results.txt").read_text()
m = re.search(r"pooled \(\d+ points\): E50 ([\d.]+), w ([\d.]+)", res)
e50, w = float(m.group(1)), float(m.group(2))
series = []
for label, pts in (("Casappa KAPPA 30", ge.casappa()), ("Danfoss SNP3", ge.danfoss()),
                   ("Marzocchi ALP3", ge.marzocchi())):
    pts = sorted(pts)
    series.append((label, [p[0] for p in pts], [p[1] for p in pts]))
xs = [round(0.76 + 0.01 * i, 3) for i in range(20)]
series.append(("pooled fit", xs, [ge.logistic(x, e50, w) for x in xs]))
write_lines(HERE, "gear_pump_evidence.svg",
            "Excavator: one efficiency number sets the fuel ranking",
            "Share of 384 excavator geometries in which a smaller fixed gear pump beats load-sensing on fuel, "
            "against the gear pump's overall efficiency at 150 bar and 85 L/min, for three makers' curves "
            f"scaled by a factor c, with one logistic curve fitted to all three (50% at {e50:.3f})",
            "fixed gear pump overall efficiency at 150 bar, 2100 r/min, 85 L/min",
            "geometries where a smaller fixed pump wins (%)", series, hline=50, vline=e50,
            xticks=[0.76, 0.78, 0.80, 0.82, 0.84, 0.86, 0.88, 0.90, 0.92, 0.94])

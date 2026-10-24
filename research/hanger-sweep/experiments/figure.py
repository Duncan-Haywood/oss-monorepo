"""Writes experiments/err_vs_B.svg from the committed results.txt: error at the +1 cm width against B.

python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

series = {}
for l in (HERE / "results.txt").read_text().splitlines():
    p = l.split()
    if len(p) >= 7 and p[4].startswith(("+", "-")) and p[1] == "1.0" and p[3] == "0.20":
        series.setdefault(f"EA {p[2]} N/m", []).append((float(p[0]), float(p[6])))
S = [(k, [x for x, _ in v], [y for _, y in v]) for k, v in sorted(series.items(), key=lambda kv: float(kv[0].split()[1]))]
write_lines(HERE, "err_vs_B.svg", "Shape error at the +1 cm width against bending rigidity (M tee, 20 cm strip, base weight)",
            "Line plot of the wooden-shaped hanger's shape error at arm width half shoulder plus 1 cm against fabric bending rigidity, for three stretch stiffnesses; flat across two orders of magnitude of bending rigidity, higher for the stretchiest fabric",
            "bending rigidity B (gf cm2/cm)", "shape error (cm RMS)", S, logx=True)

"""Best arm-width offset against stretch stiffness EA on the 3 cm arm: shear tied to EA (milestone
1c) against shear set from measured KES G (milestone 1d), fabrics A and D.

    python3 experiments/m1d_measured_shear/figure.py    (reads results.txt; stdlib only)
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

best, old = {}, {}
sec = None
for l in (HERE / "results.txt").read_text().splitlines():
    if l[:2] in ("2.", "3."):
        sec = l[:2]
        continue
    t = l.split()
    if sec == "2." and len(t) == 10:
        best.setdefault(t[0], []).append((float(t[1]), float(t[2])))
    elif sec == "3." and len(t) == 4:
        old.setdefault(t[0], []).append((float(t[1]), float(t[2])))
series = []
for c in ("A", "D"):
    r = sorted(best[c])
    series.append((f"fabric {c}, shear = measured G", [math.log10(e) for e, _ in r], [b for _, b in r]))
    r = sorted(old[c])
    series.append((f"fabric {c}, shear tied to 0.1 EA (1c)", [math.log10(e) for e, _ in r], [b for _, b in r]))
write_lines(HERE, "best_width_vs_ea.svg",
            "3 cm arm: best width against stretch stiffness, shear tied to EA or set from measured G",
            "Best arm width offset against log10 of stretch stiffness EA for fabrics A and D, with the shear spring tied to EA (milestone 1c) and set from measured KES shear rigidity (milestone 1d)",
            "log10 EA (N/m)", "best arm half width minus half shoulder (cm)", series)

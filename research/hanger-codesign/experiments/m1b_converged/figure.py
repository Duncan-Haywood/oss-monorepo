"""Shape error against arm-width offset on fabric D's 3 cm arm: stopped at 3000 iterations against
solved to convergence (and the 2D chain, post hoc, for scale).

    python3 experiments/m1b_converged/figure.py    (reads results.txt and posthoc_2d.txt; stdlib only)
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

FAB = "D"
rows = []
for l in (HERE / "results.txt").read_text().splitlines():
    t = l.split()
    if len(t) == 9 and t[0] == FAB and ":" not in l:
        rows.append((float(t[1]), float(t[2]), float(t[3])))
two = {float(t[1]): float(t[2]) for t in (l.split() for l in (HERE / "posthoc_2d.txt").read_text().splitlines())
       if len(t) == 3 and t[0] == FAB and t[1] != "best"}
xs = [r[0] for r in rows]
series = [("3D 3 cm arm, 3000 iterations", xs, [r[1] for r in rows]),
          ("3D 3 cm arm, converged", xs, [r[2] for r in rows]),
          ("2D chain (post hoc)", xs, [two[x] for x in xs])]
write_lines(HERE, "converged_vs_capped_D.svg",
            "Fabric D, 3 cm arm: converging moves the best width from +1 to +1.5 cm",
            "Shape error against arm width offset, 3000-iteration and converged 3D solves and the 2D chain, fabric D",
            "arm half width minus half shoulder (cm)", "shape error (cm RMS)", series)

"""Write experiments/depth.svg: Hertz indentation depth of the worst-trial force against face modulus, for several tip radii.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
sys.path.insert(0, str(HERE))
from linefig import write_lines  # noqa: E402
import run  # noqa: E402

F = run.worst_peaks()[(1000, 0.20)]
xs = [4.0, 10.0, 20.0, 45.0]
series = [("tip R=%g mm" % r, xs, [run.hertz(F, r * 1e-3, e * 1e3)[1] * 1e3 for e in xs]) for r in (4.0, 15.0, 25.0)]
write_lines(HERE, "depth.svg", "Hertz indentation depth at the worst-trial force (%.1f N)" % F,
            "Line plot of the indentation depth in millimetres that a sphere of radius 4, 15 or 25 millimetres would sink into a soft half-space at %.1f newtons, against the half-space's Young's modulus in kilopascals between 4 and 45" % F,
            "face modulus (kPa)", "indentation depth (mm)", series)

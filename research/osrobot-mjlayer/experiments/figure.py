"""Write experiments/budget.svg: force at which a bonded tissue layer is indented to 30 % of its thickness.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
sys.path.insert(0, str(HERE))
from linefig import write_lines  # noqa: E402
import run  # noqa: E402

xs = list(run.THICK_MM)
series = [("E=%g kPa, R=4 mm" % e, xs, [run.budget(0.004, e * 1e3, h * 1e-3) for h in xs]) for e in run.MODULI_KPA]
write_lines(HERE, "budget.svg", "Force that indents a bonded tissue layer to 30 % of its thickness (4 mm tip)",
            "Line plot of the force in newtons, between 0 and 4, at which a 4 millimetre radius spherical tip indents a soft tissue layer bonded to bone to 30 percent of the layer thickness, against layer thickness from 5 to 20 millimetres, for moduli of 4, 10 and 45 kilopascals",
            "layer thickness (mm)", "force budget (N)", series)

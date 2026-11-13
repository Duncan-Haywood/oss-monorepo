"""Figure for milestone 6d: share of the 384 excavator geometry cases in which a smaller fixed pump wins, by rest-of-machine fuel rate.

Reads excavator_threshold_screening_results.txt (numbers are never retyped). Stdlib only.
Usage: python3 threshold_screening_figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

text = (HERE / "excavator_threshold_screening_results.txt").read_text()
xs, (every, central, some) = table(text, "Decision curve", 0, [1, 2, 3])
write_lines(HERE, "threshold_decision_curve.svg",
            "Excavator: where a smaller fixed pump still beats load-sensing on fuel",
            "Share of 384 cylinder-geometry cases in which a smaller fixed open-centre pump burns less fuel than "
            "load-sensing, against the rest-of-machine fuel rate over the extra working time; under all 108 "
            "parameter sets, at central parameters, and under at least one set.",
            "rest-of-machine fuel rate f_t (L/h)", "share of geometry cases (%)",
            [("every parameter set", xs, every), ("central parameters", xs, central),
             ("some parameter set", xs, some)])

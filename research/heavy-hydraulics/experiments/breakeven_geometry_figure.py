"""Figure for milestone 6c: the break-even rest-of-machine fuel rate over 384 geometry cases, sorted.

Reads excavator_breakeven_geometry_results.txt (numbers are never retyped). Stdlib only.
Usage: python3 breakeven_geometry_figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

text = (HERE / "excavator_breakeven_geometry_results.txt").read_text()
xs, (fs,) = table(text, "Sorted f_t,max over the 384 cases", 0, [1])
write_lines(HERE, "breakeven_geometry.svg",
            "Excavator: rest-of-machine fuel rate below which a smaller fixed pump wins",
            "Break-even rest-of-machine fuel rate f_t,max for each of 384 cylinder-geometry cases on the measured "
            "excavator motion, sorted; the dashed line is the loader's lowest measured fuel rate, 1.48 L/h",
            "share of the 384 geometry cases (%)", "break-even rate f_t,max (L/h)",
            [("f_t,max, central parameters", xs, fs)], hline=1.48)

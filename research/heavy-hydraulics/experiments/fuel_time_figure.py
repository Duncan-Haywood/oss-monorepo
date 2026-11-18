"""Figure for milestone 5x: open-centre minus load-sensing fuel against the fixed pump size.

Reads measured_fuel_time_results.txt (numbers are never retyped). Stdlib only.
Usage: python3 fuel_time_figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

text = (HERE / "measured_fuel_time_results.txt").read_text()
xs, (hyd, tim, tot) = table(text, "whole record, fuel per unit of work", 0, [2, 3, 4], maxrows=9)
write_lines(HERE, "fuel_time_pump_size.svg",
            "Measured loader: open-centre extra fuel by fixed pump size",
            "Extra fuel of an open-centre circuit over load-sensing for the same 440 s of wheel-loader work, "
            "split into pump energy and the fuel burned over the extra time, against fixed pump displacement",
            "fixed open-centre pump displacement (cc)", "extra fuel over load-sensing (mL per 440 s record)",
            [("total", xs, tot), ("pump energy part", xs, hyd), ("extra-time part", xs, tim)])

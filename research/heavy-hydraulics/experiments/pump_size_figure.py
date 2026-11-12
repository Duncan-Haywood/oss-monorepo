"""Write experiments/trade_pump_size.svg: the measured loader's break-even load-sensing margin against the
extra record time a smaller fixed open-centre pump costs (5w), parsed from measured_pump_size_results.txt
(never retyped). Dashed line: the loader's measured 24.9 bar margin.

    python3 experiments/pump_size_figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

text = (HERE / "measured_pump_size_results.txt").read_text()
vg, (m, tr) = table(text, "whole record, sweep", 0, [1, 8], maxrows=9)
extra = [round((t - 1) * 100, 2) for t in tr]
write_lines(HERE, "trade_pump_size.svg",
            "Smaller fixed pump on a measured wheel loader: margin vs time",
            "Break-even load-sensing margin falls from 87 bar at 63 cc to the measured 24.9 bar at about 28.5 cc, "
            "where open-centre needs about 39% more record time",
            "extra record time for open-centre vs load-sensing, % (pump 63 cc at left, 25 cc at right)",
            "break-even LS margin m*, bar",
            [("whole record, case (b)", extra, m)], hline=24.9)

"""Write experiments/netvalue.svg: interest saved minus the offsite premium, by house price (experiments C and D).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

text = (HERE / "results.txt").read_text().splitlines()
series = []
for sec, label in (("C. Net", "ordered day 0"), ("D. Same", "ordered at foundation start")):
    xs, ys = table(text, sec, 0, [1, 2], maxrows=4)
    for k, crane in enumerate(("$1,500", "$750")):
        series.append((f"{label}, crane {crane}", [x / 1000 for x in xs], ys[k]))
write_lines(HERE, "netvalue.svg", "Net value of a factory shell once interest is counted",
            "Net value ($) of the factory shell against house price, four scenarios: " + "; ".join(
                f"{n}: " + ", ".join(f"{x:.0f}k {y:.0f}" for x, y in zip(xs_, ys_)) for n, xs_, ys_ in series),
            "house price ($ thousand, not sourced)", "interest saved minus premium ($)", series, hline=0)

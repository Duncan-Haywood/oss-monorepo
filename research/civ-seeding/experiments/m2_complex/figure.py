"""Write takeup_by_k.svg: non-leader take-up by number of adopting neighbours, data against the
information and threshold fits, parsed from results.txt.

python3 experiments/m2_complex/figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    text = (HERE / "results.txt").read_text()
    xs = [0, 1, 2, 3, 4]
    m = re.search(r"empirical non-leader take-up by adopting neighbours 0,1,2,3,4\+: (.*)", text)
    data = [float(t.split("(")[0]) for t in m.group(1).split()]
    series = [("data (43 villages)", xs, data)]
    for fam, name in (("I", "information model fit"), ("T", "threshold model fit")):
        m = re.search(rf"simulated at {fam} ext8 fit .*by adopting neighbours 0\.\.4\+: (.*)", text)
        series.append((name, xs, [float(t) for t in m.group(1).split()]))
    write_lines(HERE, "takeup_by_k.svg",
                "Microfinance take-up by number of adopting neighbours",
                "Line plot of non-leader take-up against the number of neighbours who adopted (0 to 4 or "
                "more). The data rise from 8% to 35%; the fitted information and threshold models rise "
                "from about 8 to 10% to 27 to 29%, below the data at 4 or more",
                "adopting neighbours (4 = 4 or more)", "share of non-leaders who took up", series)


if __name__ == "__main__":
    main()

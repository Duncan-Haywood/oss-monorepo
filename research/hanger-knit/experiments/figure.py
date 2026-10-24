"""Writes experiments/cross.svg from the committed results.txt: error of each designed hanger on every case.

python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

lines = (HERE / "results.txt").read_text().splitlines()
i = next(k for k, l in enumerate(lines) if l.startswith("== C."))
cols = lines[i + 1].split()[1:]
S = []
for l in lines[i + 2:]:
    t = l.rsplit(" ", len(cols))
    S.append((t[0].replace("designed_for ", ""), list(range(1, len(cols) + 1)), [float(x) for x in t[1:]]))
write_lines(HERE, "cross.svg",
            "Shape error of a hanger designed for one fabric, scored on each (x: " + ", ".join(f"{k + 1} {c}" for k, c in enumerate(cols)) + ")",
            "Line plot of shape error against the fabric case, one line per hanger designed for a case plus the stock hanger; every line rises toward the soft, heavy, narrow cases and a hanger designed for a case is lowest on that case",
            "case (1 stiffest knit-free tee ... 5 soft, heavy, narrow strip)", "shape error (cm RMS)", S)

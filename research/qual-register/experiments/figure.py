"""Write experiments/audit_power.svg: how often a hand-coded sample reveals a register difference in coder
error, parsed from results.txt (section E3).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

lines = (HERE / "results.txt").read_text().splitlines()
i = next(k for k, l in enumerate(lines) if l.startswith("E3."))
xs = [float(t[2:]) for t in lines[i + 1].split()[1:]]
series = [(l.split()[0], xs, [float(v) for v in l.split()[1:]]) for l in lines[i + 2:i + 4]]
write_lines(HERE, "audit_power.svg", "Share of hand-coded samples that flag a register difference in coder error",
            "Line plot: for both coders the share of random hand-coded samples whose z test flags a register difference "
            "stays near the 5% false-positive rate from 50 to 800 items",
            "hand-coded items", "share flagged", series, logx=True, logy=False, hline=0.05)

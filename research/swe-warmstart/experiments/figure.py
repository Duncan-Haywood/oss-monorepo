"""Write experiments/start5000.svg: value reached at a 5,000-line budget on the observed history, by start rule.

    python experiments/figure.py

Parsed from the committed results.txt (part 1), never retyped; re-run run.py first if the experiment changes.
"""
from pathlib import Path
import re, sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "swe-allocate" / "experiments"))
from figure import bars_svg  # noqa: E402

NAMES = ["uniform", "greedy", "greedy-1pull", "thompson", "thompson-1pull"]

def main():
    groups, data = [], []
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"== value = (\w+)", l)
        if m: groups.append(m.group(1)); data.append([])
        if l.startswith("budget 5000 ("):
            cells = dict(re.findall(r"([\w-]+) ([\d.]+) \[", l))
            data[-1] = [float(cells[n]) for n in NAMES]
    assert len(groups) == 2 and all(len(d) == len(NAMES) for d in data), (groups, data)
    (HERE / "start5000.svg").write_text(bars_svg(
        "Value points at a 5,000-line budget, observed history",
        "Grouped bars of value points reached by uniform, greedy and Thompson allocation with two or one forced pulls per track, under two value definitions",
        groups, NAMES, data, "value points"))
    print("wrote", HERE / "start5000.svg")

if __name__ == "__main__":
    main()

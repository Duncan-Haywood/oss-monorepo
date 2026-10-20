"""Write experiments/policies_vs_capacity.svg: each simple policy's value as a share of the DP policy's, against market capacity.

    python experiments/figure.py

Parsed from table 1 of the committed results.txt (the c=inf row has no finite x and is skipped), never retyped.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

ROW = re.compile(r"^c=(\S+)\s.*?bang-bang ts=\s*\d+\s+([\d.]+)%\s*\|\s*const u=[\d.]+\s+([\d.]+)%\s*\|\s*smooth ts=\d+,w=\d+\s+([\d.]+)%\s*\|\s*piecewise\s+([\d.]+)%")


def main():
    text = (HERE / "results.txt").read_text().split("table 2:")[0]
    rows = []
    for l in text.splitlines():
        m = ROW.match(l)
        if m and m.group(1) != "inf":
            rows.append([float(g) for g in m.groups()])
    rows.sort()
    xs = [r[0] for r in rows]
    names = ["bang-bang", "constant split", "smooth switch", "piecewise"]
    series = [(n, xs, [r[1 + i] for r in rows]) for i, n in enumerate(names)]
    write_lines(HERE, "policies_vs_capacity.svg",
                "Self-replicating shop: simple policies vs the DP optimum, by market capacity",
                "Line plot of four simple copy-versus-sell policies as a percentage of the dynamic-programming policy's value against market capacity; "
                "constant split falls far behind at low capacity while bang-bang, smooth and piecewise policies stay above 93 percent",
                "market capacity c (machine-hours per hour)", "value, % of DP policy", series, logx=True)


if __name__ == "__main__":
    main()

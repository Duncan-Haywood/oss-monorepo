"""Write experiments/bangbang_vs_resale.svg: the bang-bang policy's value as a share of the DP policy's, against the resale value s/s*, one line per market capacity.

    python experiments/figure.py

Parsed from the committed results.txt (the c=inf block is skipped as it has no finite capacity to label), never retyped.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

HEAD = re.compile(r"^== market capacity c = (\S+)")
ROW = re.compile(r"^s=\s*[\d.]+ \(([\d.]+) s\*\).*?bang-bang ts=\s*\d+\s+([\d.]+)%")


def main():
    series, cur = [], None
    for l in (HERE / "results.txt").read_text().splitlines():
        h = HEAD.match(l)
        if h:
            cur = None if h.group(1) == "inf" else ([], [])
            if cur:
                series.append(("c = " + h.group(1), *cur))
            continue
        m = ROW.match(l)
        if m and cur:
            cur[0].append(float(m.group(1)))
            cur[1].append(float(m.group(2)))
    write_lines(HERE, "bangbang_vs_resale.svg",
                "Self-replicating shop: bang-bang vs the DP policy, by resale value",
                "Line plot of the bang-bang policy's value as a percentage of the dynamic-programming policy's against the resale value of a machine "
                "as a fraction of the never-switch threshold, for three finite market capacities; tight markets with no resale value cost bang-bang the most",
                "resale value s / s*", "bang-bang value, % of DP policy", series)


if __name__ == "__main__":
    main()

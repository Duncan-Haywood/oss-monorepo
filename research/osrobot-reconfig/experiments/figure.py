"""Write experiments/dedicated_share.svg: share of job mixes where a robot per job is cheapest, against tray scatter.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (block 1), never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def block1(text):
    rows, on = {}, False
    for l in text.splitlines():
        if l.startswith("1. "):
            on = True
        elif on and l[:2] in ("2.", "3."):
            break
        elif on:
            p = l.split()
            if len(p) >= 7 and p[0].isdigit():
                rows.setdefault(int(p[0]), []).append((float(p[1]), float(p[4])))
    return rows


def main():
    rows = block1((HERE / "results.txt").read_text())
    series = [(f"{j} jobs", [x for x, _ in rows[j]], [y for _, y in rows[j]]) for j in (2, 4, 8)]
    write_lines(HERE, "dedicated_share.svg", "A robot per job is cheapest only when trays are spread out",
                "Line plot of the share of random job mixes in which one robot per job is the cheapest option, against how far apart the trays sit, for 2, 4 and 8 jobs",
                "tray scatter radius (m)", "share of mixes", series)


if __name__ == "__main__":
    main()

"""Milestone 11ar post hoc (written after sort_rule_results.txt was read; no prediction): per layout-draw, how often
does each rule beat the blind plan, and how often does one descent from the sort labels beat the blind plan?
Q1 was refuted because the sort rule's median is above the blind plan's, so this counts the draws, not the medians.

    python3 sort_rule_posthoc.py > sort_rule_posthoc_results.txt     # reads sort_rule.json.gz
"""
import gzip
import json
import os
import statistics as S

HERE = os.path.dirname(os.path.abspath(__file__))


def counts(rows):
    n = len(rows)
    lt = lambda a, b: sum(1 for x in rows if x[a] < x[b] * (1 - 1e-12))
    ratio = [x["F_sort_o"] / x["F_blind"] for x in rows]
    return n, lt("F_sort_o", "F_blind"), lt("F_desc_o", "F_blind"), S.median(ratio), max(ratio)


def main():
    with gzip.open(os.path.join(HERE, "sort_rule.json.gz"), "rt") as f:
        res = json.load(f)
    print("# Milestone 11ar post hoc: rules against the blind plan, per layout-draw (sort_rule_posthoc.py's docstring)")
    print("  M   s    n    sort(o) < blind   desc(o) < blind   sort(o)/blind med   max")
    for m in (12, 16):
        for s in ("1.0", "2.0"):
            rows = [x for r in res if r["m"] == m for x in r["cells"][s]]
            n, a, b, med, mx = counts(rows)
            print("  %-3d %-4s %3d  %3d of %-3d       %3d of %-3d       %7.4f            %7.4f" % (
                m, s.rstrip("0").rstrip("."), n, a, n, b, n, med, mx))


if __name__ == "__main__":
    main()

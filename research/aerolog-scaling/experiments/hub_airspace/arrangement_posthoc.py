"""Milestone 11aq post hoc (written after arrangement_results.txt was read; no prediction): R1 and R0 split by the
aware planner's chosen spacing h*. arrangement.py's P3 (more sorting at s = 2) was refuted, and R0 (same-level pairs)
went above 1 at s = 2. Hypothesis checked here: at the wide spacings s = 2 often picks (24 m, 3 bands), an offset
difference inside one level is itself vertical separation, so the planner puts different offsets in one level.

    python3 arrangement_posthoc.py > arrangement_posthoc_results.txt     # reads arrangement_plans.json.gz
"""
import gzip
import json
import os
import statistics as S
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import arrangement as ar  # noqa: E402


def split(res):
    """{(M, s, h*): [(R1, R0), ...]}"""
    out = {}
    for r in res:
        for s, rows in r["cells"].items():
            for x in rows:
                key = (r["m"], float(s), round(x["h"], 2))
                out.setdefault(key, []).append((ar.ratio(x["A1"], x["N1"]), ar.ratio(x["A0"], x["N0"])))
    return out


def main():
    with gzip.open(os.path.join(HERE, "arrangement_plans.json.gz"), "rt") as f:
        res = json.load(f)
    print("# Milestone 11aq post hoc: R1 (one level apart) and R0 (same level) by the aware plan's h* "
          "(arrangement_posthoc.py's docstring); medians over layout-draws, nan where no weighted pair exists")
    print("  M   s    h*      n    R1 med   R0 med   R0 > 1")
    for key in sorted(split(res)):
        v = split(res)[key]
        r1 = [a for a, _ in v if a == a]
        r0 = [b for _, b in v if b == b]
        print("  %-3d %-4g %6.2f  %3d   %7.4f  %7.4f   %d of %d" % (
            key[0], key[1], key[2], len(v), S.median(r1) if r1 else float("nan"),
            S.median(r0) if r0 else float("nan"), sum(1 for b in r0 if b > 1), len(r0)))


if __name__ == "__main__":
    main()

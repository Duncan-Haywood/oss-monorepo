"""Experiments for house-continuous. Deterministic; about a minute.

    PYTHONPATH=src:../house-spans/src python experiments/run.py      # writes experiments/results.txt
"""
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parent.parent / "house-spans" / "src"))
from house_continuous.model import max_span  # noqa: E402
from house_spans.model import CASES, Member  # noqa: E402
from house_spans.model import max_span as simple_max_span  # noqa: E402

SIZES = ("2x6", "2x8", "2x10", "2x12")
SPACINGS = (12, 16, 19.2, 24)
out = []


def p(s=""):
    out.append(s)


def fi(ft):
    n = int(ft * 12)
    return f"{n // 12}'{n % 12:>2}\""


p("house-continuous experiments (SPF No. 2, equal spans, clear span per span, 1.5 in bearing, pattern loading)")
p()
gains = {}
for case in ("floor", "ceiling", "roof-snow30"):
    p(f"A. {case}: simple / 2-span / 3-span clear span, governing check (bend, defl, shea, bear)")
    p("  size   " + "".join(f"{s:>26g} in" for s in SPACINGS))
    cnt = {1: Counter(), 2: Counter(), 3: Counter()}
    g2 = []
    for s in SIZES:
        row = f"  {s:<6} "
        for sc in SPACINGS:
            m = Member(s, spacing_in=sc)
            s1, g1 = simple_max_span(m, CASES[case])
            s2, gg2 = max_span(m, CASES[case], 2)
            s3, gg3 = max_span(m, CASES[case], 3)
            row += f" {fi(s1)} {fi(s2)} {fi(s3)}"
            for k, g in ((1, g1), (2, gg2), (3, gg3)):
                cnt[k][g[:4]] += 1
            g2.append((s2 - s1) / s1)
        p(row)
    gains[case] = g2
    for k in (1, 2, 3):
        p(f"  governing, {k}-span: " + ", ".join(f"{a} {b}" for a, b in sorted(cnt[k].items())))
    p(f"  gain of 2-span over simple: min {min(g2):+.1%}, max {max(g2):+.1%}")
    p()

p("B. Which check ends a 2-span joist's span when bending stops governing? 2x10 at 16 in, floor")
m = Member("2x10", spacing_in=16)
for lim in (360, 480):
    from dataclasses import replace
    c = replace(CASES["floor"], live_limit=lim)
    s1, g1 = simple_max_span(m, c)
    s2, g2_ = max_span(m, c, 2)
    s3, g3 = max_span(m, c, 3)
    p(f"  live limit L/{lim}: simple {fi(s1)} ({g1}), 2-span {fi(s2)} ({g2_}), 3-span {fi(s3)} ({g3})")
p()
p("C. Interior bearing length, 2x10 at 16 in, floor, 2-span: clear span per span and what governs")
for ib in (1.5, 3.5, 5.5):
    s2, g = max_span(Member("2x10", spacing_in=16), CASES["floor"], 2, interior_bearing_in=ib)
    p(f"  {ib} in at the middle support: {fi(s2)} ({g})")
p()
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))

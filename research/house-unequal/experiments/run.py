"""Experiments for house-unequal. Deterministic.

    PYTHONPATH=src:../house-continuous/src:../house-spans/src python experiments/run.py   # writes results.txt
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for sub in ("house-unequal", "house-continuous", "house-spans"):
    sys.path.insert(0, str(HERE.parent.parent / sub / "src"))
from house_spans.model import CASES, Member  # noqa: E402
from house_unequal.model import max_total  # noqa: E402

RATIOS = (1.0, 0.9, 0.8, 0.7, 0.6, 0.5)
out = []


def p(s=""):
    out.append(s)


def fi(ft):
    n = int(ft * 12)
    return f"{n // 12}'{n % 12:>2}\""


p("house-unequal experiments (SPF No. 2, 2 spans, 1.5 in end bearing, 3.5 in at the beam, pattern loading)")
p("ratio = short clear span / long clear span; total = both clear spans added")
p()
loss = {}
for case, size, sp in (("floor", "2x10", 16), ("floor", "2x8", 16), ("floor", "2x12", 16), ("ceiling", "2x8", 16),
                       ("ceiling", "2x6", 16), ("roof-snow30", "2x10", 16)):
    m = Member(size, spacing_in=sp)
    p(f"A. {case}, {size} at {sp} in: total clear width, long span, governing check")
    base = None
    for r in RATIOS:
        tot, gov = max_total(m, CASES[case], r)
        base = base or tot
        long_ = tot / (1 + r)
        p(f"  ratio {r:.1f}: total {fi(tot)}  long span {fi(long_)}  total vs centred {tot / base - 1:+6.1%}  governed by {gov}")
        loss[(case, size, r)] = tot / base - 1
    p()

p("B. Beam offset from the middle that still clears a given floor width (2x10 SPF at 16 in, floor)")
m = Member("2x10", spacing_in=16)
for width in (24, 26, 28, 30):
    best = None
    lo, hi = 0.3, 1.0
    for _ in range(12):
        mid = (lo + hi) / 2
        if max_total(m, CASES["floor"], mid)[0] >= width:
            hi, best = mid, mid
        else:
            lo = mid
    if best is None:
        p(f"  {width} ft wide: no beam position works")
        continue
    l1 = width / (1 + best)
    p(f"  {width} ft wide: beam may sit {abs(width / 2 - l1 * best):.1f} ft from the middle "
      f"(spans {fi(l1)} + {fi(width - l1)}, ratio {best:.2f}); at the middle the limit is {fi(max_total(m, CASES['floor'], 1.0)[0])}")
p()
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))

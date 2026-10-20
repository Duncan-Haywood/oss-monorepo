"""Experiments for house-vibration. Deterministic; writes experiments/results.txt.

    PYTHONPATH=src:../house-spans/src python experiments/run.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parent.parent / "house-spans" / "src"))
from house_spans.model import Member, board_feet_per_sf  # noqa: E402
from house_vibration.model import cheapest, frequency_hz, max_span  # noqa: E402

LIMITS = (0, 6, 8, 10, 12, 15)
out = []


def p(s=""):
    out.append(s)


def fi(ft):
    n = int(ft * 12)
    return f"{n // 12}'{n % 12:>2}\""


p("house-vibration experiments (SPF No. 2 floor joists, 10 psf dead + 40 psf live; joist alone, no subfloor composite action)")
p("frequency = first mode of a simply supported beam carrying the 10 psf dead load; limits are in Hz, 0 = no limit")
p()
p("A. First natural frequency (Hz) of the longest strength-and-deflection-passing joist (no frequency limit)")
p("  size    12 in    16 in  19.2 in    24 in")
for s in ("2x6", "2x8", "2x10", "2x12"):
    row = f"  {s:<5}"
    for sc in (12, 16, 19.2, 24):
        m = Member(s, spacing_in=sc)
        row += f"{frequency_hz(m, max_span(m, 0)):>9.1f}"
    p(row)
p()
p("B. Maximum clear span (ft-in) by frequency limit, 16 in and 24 in spacing")
p("  size  spacing " + "".join(f"{l:>8g}Hz" for l in LIMITS))
for s in ("2x6", "2x8", "2x10", "2x12"):
    for sc in (16, 24):
        m = Member(s, spacing_in=sc)
        p(f"  {s:<5} {sc:>4} in " + "".join(f"{fi(max_span(m, l)):>10}" for l in LIMITS))
p()
p("C. Least lumber that passes (board feet per sq ft), cheapest size and spacing, by frequency limit")
p("  span  " + "".join(f"{l:>17g}Hz" for l in LIMITS))
for span in (8, 10, 12, 14, 16):
    row = f"  {span:>2} ft "
    for l in LIMITS:
        c = cheapest(span, l)
        row += f"{(f'{c[1]}@{c[2]:g} {c[0]:.2f}' if c else 'none'):>19}"
    p(row)
p()
p("D. Saving of the cheapest joist over 2x10 at 16 in, as % of 2x10 @16 lumber; '-' where 2x10 @16 itself fails")
ref = board_feet_per_sf(Member("2x10", spacing_in=16))
p("  span  " + "".join(f"{l:>7g}Hz" for l in LIMITS))
for span in (8, 10, 12, 14, 16):
    row = f"  {span:>2} ft "
    for l in LIMITS:
        c = cheapest(span, l)
        ok = cheapest(span, l, sizes=("2x10",), spacings=(16,))
        row += f"{(f'{100 * (1 - c[0] / ref):.0f}%' if (c and ok) else '-'):>9}"
    p(row)
p()
p("E. Maximum clear span (decimal ft) against the frequency limit")
cols = (("2x8", 16), ("2x10", 16), ("2x10", 24), ("2x12", 24))
p("  limit_Hz " + "".join(f"{s}@{sc:>2}  " for s, sc in cols))
for l in range(0, 21, 2):
    p(f"  {l:>6} " + "".join(f"{max_span(Member(s, spacing_in=sc), l):>9.2f}" for s, sc in cols))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))

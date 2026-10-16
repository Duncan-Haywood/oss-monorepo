"""Experiments for house-spans. Deterministic, under a second.

    PYTHONPATH=src python experiments/run.py      # writes experiments/results.txt
"""
import sys
from collections import Counter
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from house_spans.model import CASES, Case, Member, board_feet_per_sf, check, max_span, size_member, worst  # noqa: E402

SIZES = ("2x6", "2x8", "2x10", "2x12")
SPACINGS = (12, 16, 19.2, 24)
out = []


def p(s=""):
    out.append(s)


def fi(ft):
    n = int(ft * 12)  # round down to the inch
    return f"{n // 12}'{n % 12:>2}\""


p("house-spans experiments (SPF/DF-L No. 2, simple span, uniform load; spans are clear spans, 1.5 in bearing)")
p()
p("A. Maximum clear span, ft-in, and the governing check (bend/shea/defl=deflection/bear)")
for case in ("floor", "ceiling", "roof-snow30"):
    for sp in ("SPF", "DF-L"):
        p(f"{case}, {sp}")
        p("  size   " + "".join(f"{s:>14g} in" for s in SPACINGS))
        for s in SIZES:
            row = f"  {s:<6} "
            for sc in SPACINGS:
                ft, gov = max_span(Member(s, species=sp, spacing_in=sc), CASES[case])
                row += f"  {fi(ft):>7} {gov[:4]:<4}"
            p(row)
p()

p("B. What governs? Count of (size, spacing, species) cells per case, 32 cells each")
for name, case in CASES.items():
    c = Counter()
    for s in SIZES:
        for sc in SPACINGS:
            for sp in ("SPF", "DF-L"):
                c[max_span(Member(s, species=sp, spacing_in=sc), case)[1]] += 1
    p(f"  {name:<15}" + "  ".join(f"{k} {v}" for k, v in sorted(c.items())))
p()

p("C. Least lumber that passes: floor joists, SPF No. 2, board feet per sq ft of floor (nominal, no waste)")
p("  span   best option        bf/sf   2nd best           bf/sf   2x10 @16 bf/sf")
for span in (8, 10, 12, 14, 16):
    opts = []
    for s in SIZES:
        for sc in SPACINGS:
            m = Member(s, spacing_in=sc)
            if worst(check(m, span, CASES["floor"]))[1] <= 1.0:
                opts.append((board_feet_per_sf(m), f"{s} @{sc:g}"))
    opts.sort()
    ref = board_feet_per_sf(Member("2x10", spacing_in=16))
    if opts:
        p(f"  {span:>2} ft  {opts[0][1]:<16} {opts[0][0]:>6.3f}   {opts[1][1]:<16} {opts[1][0]:>6.3f}   {ref:.3f}")
    else:
        p(f"  {span:>2} ft  none")
p()

p("D. Headers and beams carrying roof, 30 psf snow + 15 psf dead on a 28 ft truss span (tributary 15 ft with 1 ft overhang)")
p("   total-load limit L/240 to match house-framing, bearing 3.0 in (two jacks); sizes 2x6 to 2x12, smallest that passes")
hcase = Case("header", 15.0, 30.0, 1.15, 240, 240)
p("  opening   2-ply            3-ply            governing at 2x12 2-ply")
for ft in (3, 4, 5, 6, 7, 8):
    row = f"  {ft} ft     "
    for pl in (2, 3):
        r = size_member(ft, hcase, "SPF", 15 * 12, pl, SIZES, bearing_in=3.0)
        row += f"{(r[0] + ' ' + r[1][:4]) if r else 'none':<17}"
    m = Member("2x12", 2, "SPF", 180, False, 3.0)
    row += worst(check(m, ft, hcase))[0]
    p(row)
p()

p("E. How much of a span is policy? 2x10 SPF floor joists at 16 in, max clear span (ft-in)")
base = CASES["floor"]
variants = [
    ("L/360 live, L/240 total (as above)", base, False),
    ("L/480 live (stiff floor)", replace(base, live_limit=480), False),
    ("L/240 live (code minimum for some surfaces)", replace(base, live_limit=240), False),
    ("no deflection limit at all", replace(base, live_limit=1, total_limit=1), False),
    ("creep factor 1.5 on dead load", base, True),
]
for name, c, cr in variants:
    ft, gov = max_span(Member("2x10"), c, cr)
    p(f"  {name:<46} {fi(ft)}  {gov}")
p("  repetitive-member factor off (a lone joist):  " + fi(max_span(Member("2x10", repetitive=False), base)[0]))
p("  pitched rafters, 2x8 @16, snow 30, DF-L:     " + "  ".join(f"{pp}/12 {fi(max_span(Member('2x8', species='DF-L', pitch=pp), CASES['roof-snow30'])[0])}" for pp in (0, 4, 8, 12)))
p()

try:
    sys.path.insert(0, str(HERE.parent.parent / "house-framing" / "src"))
    from house_framing.model import SPF2, size_header, CONVENTIONAL_2X6, Loads
    wD, wS = Loads().roof_plf()
    p("F. Cross-check with house-framing's header sizing (same loads, one jack per side, 2-ply, bearing 1.5 in on jacks)")
    p("  opening   house-framing   house-spans")
    for ft in (3, 4, 5, 6, 7):
        a = size_header(ft * 12, wD + wS, CONVENTIONAL_2X6)
        r = size_member(ft, hcase, "SPF", 15 * 12, 2, SIZES, bearing_in=1.5)
        p(f"  {ft} ft     {a or 'none':<15} {r[0] if r else 'none'}")
    p("  house-framing's bearing check uses the jack's full 5.5 in stud depth (8.25 in2 under a 2-ply header); a 2-ply header is")
    p("  3 in wide, so a 1.5 in jack bears on 4.5 in2. At 6 and 7 ft the header passes on 8.25 in2 and fails on 4.5 in2.")
except ImportError:
    p("F. house-framing not importable; cross-check skipped")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
